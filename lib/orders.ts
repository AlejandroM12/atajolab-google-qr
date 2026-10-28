import { Prisma } from "@prisma/client";
import { ARTWORK_VERSION, COMMERCIAL_ARTWORK_VERSION, COUNTER_ARTWORK_VERSION, PRESS_ARTWORK_VERSION, SIGNAGE_ARTWORK_VERSION, STUDIO_ARTWORK_VERSION } from "@/lib/artwork";
import { prisma } from "@/lib/db";
import { orderStatuses, type OrderStatus } from "@/lib/delivery";
import { readArtworkSnapshot, type OrderDraft } from "@/lib/order-draft";
import { ACCESS_TOKEN_PATTERN, consumeAccessLink, hashAccessToken, issueAccessLink, linkCapOpen, type AccessLinkRecord } from "@/lib/access-link";
import { createDeliveryKey, hashDeliveryKey } from "@/lib/payments/access";
import { paymentEnvironmentMode } from "@/lib/payments/checkout-policy";
import { decidePayment, type VerifiedPayment } from "@/lib/payments/decision";
import { PIECE_CURRENCY, PIECE_PRICE_ARS } from "@/lib/pricing";
import { createPublicId, isPublicId } from "@/lib/public-id";

export type StoredOrder = {
  publicId: string;
  status: OrderStatus;
  amountArs: number;
  currency: typeof PIECE_CURRENCY;
  createdAt: Date;
  externalPaymentStatus: string | null;
  artwork: NonNullable<ReturnType<typeof readArtworkSnapshot>>;
};

export type PaymentRecord = {
  publicId: string;
  status: OrderStatus;
  amountArs: number;
  currency: string;
  preferenceId: string | null;
  paymentId: string | null;
  paymentStatus: string | null;
  deliveryKeyHash: string | null;
};

export async function savePendingOrder(
  draft: OrderDraft,
): Promise<{ publicId: string; deliveryKey: string }> {
  if (draft.amountArs !== PIECE_PRICE_ARS || draft.currency !== PIECE_CURRENCY) {
    throw new Error("order-price");
  }
  if (
    (draft.artwork.version !== ARTWORK_VERSION &&
      draft.artwork.version !== STUDIO_ARTWORK_VERSION &&
      draft.artwork.version !== COMMERCIAL_ARTWORK_VERSION &&
      draft.artwork.version !== COUNTER_ARTWORK_VERSION &&
      draft.artwork.version !== SIGNAGE_ARTWORK_VERSION &&
      draft.artwork.version !== PRESS_ARTWORK_VERSION) ||
    !draft.artwork.href
  ) {
    throw new Error("order-artwork");
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const publicId = createPublicId();
    const deliveryKey = createDeliveryKey();
    try {
      await prisma.order.create({
        data: {
          id: publicId,
          status: "PENDING",
          amountArs: PIECE_PRICE_ARS,
          currency: PIECE_CURRENCY,
          artworkVersion: draft.artwork.version,
          artwork: draft.artwork as Prisma.InputJsonValue,
          deliveryKeyHash: hashDeliveryKey(deliveryKey),
          buyerEmail: draft.buyerEmail,
        },
      });
      return { publicId, deliveryKey };
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 2) continue;
      throw error;
    }
  }

  throw new Error("order-id");
}

export async function findOrder(publicId: string): Promise<StoredOrder | null> {
  if (!isPublicId(publicId)) return null;

  const row = await prisma.order.findUnique({
    where: { id: publicId },
    select: {
      id: true,
      status: true,
      amountArs: true,
      currency: true,
      artwork: true,
      createdAt: true,
      mercadoPagoPaymentStatus: true,
    },
  });
  if (!row || row.currency !== PIECE_CURRENCY || !isOrderStatus(row.status)) return null;

  const artwork = readArtworkSnapshot(row.artwork);
  if (!artwork) return null;

  return {
    publicId: row.id,
    status: row.status,
    amountArs: row.amountArs,
    currency: PIECE_CURRENCY,
    createdAt: row.createdAt,
    externalPaymentStatus: row.mercadoPagoPaymentStatus,
    artwork,
  };
}

export async function findDownloadOrder(publicId: string): Promise<{
  publicId: string;
  status: OrderStatus;
  artwork: NonNullable<ReturnType<typeof readArtworkSnapshot>>;
  deliveryKeyHash: string | null;
  accessKeyHashes: string[];
} | null> {
  if (!isPublicId(publicId)) return null;

  const row = await prisma.order.findUnique({
    where: { id: publicId },
    select: {
      id: true,
      status: true,
      artwork: true,
      deliveryKeyHash: true,
      accessCredentials: { select: { keyHash: true } },
    },
  });
  if (!row || !isOrderStatus(row.status)) return null;

  const artwork = readArtworkSnapshot(row.artwork);
  if (!artwork) return null;

  return {
    publicId: row.id,
    status: row.status,
    artwork,
    deliveryKeyHash: row.deliveryKeyHash,
    accessKeyHashes: row.accessCredentials.map((credential) => credential.keyHash),
  };
}

export async function findOrderDeliveryHash(publicId: string): Promise<string | null> {
  if (!isPublicId(publicId)) return null;

  const row = await prisma.order.findUnique({
    where: { id: publicId },
    select: { deliveryKeyHash: true },
  });
  return row?.deliveryKeyHash ?? null;
}

export async function findPaymentRecord(publicId: string): Promise<PaymentRecord | null> {
  if (!isPublicId(publicId)) return null;

  const row = await prisma.order.findUnique({
    where: { id: publicId },
    select: {
      id: true,
      status: true,
      amountArs: true,
      currency: true,
      mercadoPagoPreferenceId: true,
      mercadoPagoPaymentId: true,
      mercadoPagoPaymentStatus: true,
      deliveryKeyHash: true,
    },
  });
  if (!row || !isOrderStatus(row.status)) return null;

  return {
    publicId: row.id,
    status: row.status,
    amountArs: row.amountArs,
    currency: row.currency,
    preferenceId: row.mercadoPagoPreferenceId,
    paymentId: row.mercadoPagoPaymentId,
    paymentStatus: row.mercadoPagoPaymentStatus,
    deliveryKeyHash: row.deliveryKeyHash,
  };
}

export async function savePreferenceId(publicId: string, preferenceId: string): Promise<void> {
  await prisma.order.updateMany({
    where: { id: publicId, status: "PENDING" },
    data: { mercadoPagoPreferenceId: preferenceId },
  });
}

export async function applyVerifiedPayment(
  publicId: string,
  payment: VerifiedPayment,
  checkedAt: Date,
): Promise<void> {
  const order = await findPaymentRecord(publicId);
  if (!order) return;

  const decision = decidePayment(order, payment, checkedAt, paymentEnvironmentMode());
  if (decision.action === "ignore") return;

  if (decision.action === "record-external") {
    await prisma.order.updateMany({
      where: { id: publicId, status: "PENDING" },
      data: {
        mercadoPagoPaymentId: decision.paymentId,
        mercadoPagoPaymentStatus: decision.paymentStatus,
        paymentCheckedAt: checkedAt,
      },
    });
    return;
  }

  await prisma.order.updateMany({
    where: { id: publicId, status: "PENDING" },
    data: {
      status: "PAID",
      mercadoPagoPaymentId: decision.paymentId,
      mercadoPagoPaymentStatus: decision.paymentStatus,
      paymentCheckedAt: checkedAt,
      paidAt: decision.paidAt,
    },
  });
}

export async function findOrderAccessHashes(publicId: string): Promise<string[]> {
  if (!isPublicId(publicId)) return [];

  const row = await prisma.order.findUnique({
    where: { id: publicId },
    select: {
      deliveryKeyHash: true,
      accessCredentials: { select: { keyHash: true } },
    },
  });
  if (!row) return [];

  const hashes: string[] = [];
  if (row.deliveryKeyHash) hashes.push(row.deliveryKeyHash);
  for (const credential of row.accessCredentials) hashes.push(credential.keyHash);
  return hashes;
}

export async function findRecoveryCandidates(email: string): Promise<{
  publicId: string;
  status: OrderStatus;
  buyerEmail: string | null;
  label: string;
}[]> {
  const rows = await prisma.order.findMany({
    where: { buyerEmail: email, status: "PAID" },
    orderBy: { paidAt: "desc" },
    take: 5,
    select: { id: true, status: true, buyerEmail: true, artwork: true },
  });

  return rows.flatMap((row) => {
    if (!isOrderStatus(row.status)) return [];
    return [{
      publicId: row.id,
      status: row.status,
      buyerEmail: row.buyerEmail,
      label: pieceLabel(row.artwork),
    }];
  });
}

export async function countActiveAccessLinks(publicId: string, now: Date): Promise<number> {
  return prisma.downloadAccessLink.count({
    where: { orderId: publicId, usedAt: null, expiresAt: { gt: now } },
  });
}

export async function saveAccessLink(record: AccessLinkRecord): Promise<boolean> {
  const active = await countActiveAccessLinks(record.orderId, new Date());
  if (!linkCapOpen(active)) return false;
  try {
    await prisma.downloadAccessLink.create({
      data: {
        tokenHash: record.tokenHash,
        orderId: record.orderId,
        expiresAt: record.expiresAt,
      },
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

export async function revokeAccessLinks(tokenHashes: string[]): Promise<void> {
  if (tokenHashes.length === 0) return;
  await prisma.downloadAccessLink.deleteMany({
    where: { tokenHash: { in: tokenHashes }, usedAt: null },
  });
}

export async function createDownloadAccessLink(
  publicId: string,
  now: Date,
): Promise<{ token: string; expiresAt: Date } | "capped" | "unavailable"> {
  if (!isPublicId(publicId)) return "unavailable";
  const order = await prisma.order.findUnique({
    where: { id: publicId },
    select: { status: true },
  });
  if (!order || order.status !== "PAID") return "unavailable";
  const active = await countActiveAccessLinks(publicId, now);
  if (!linkCapOpen(active)) return "capped";
  const issued = issueAccessLink(publicId, now);
  const saved = await saveAccessLink(issued.record);
  if (!saved) return "capped";
  return { token: issued.token, expiresAt: issued.record.expiresAt };
}

export async function redeemDownloadAccess(
  token: string,
  now: Date,
): Promise<{ ok: true; publicId: string; deliveryKey: string } | { ok: false }> {
  if (token.length !== 43 || !ACCESS_TOKEN_PATTERN.test(token)) return { ok: false };
  const tokenHash = hashAccessToken(token);
  const deliveryKey = createDeliveryKey();
  const keyHash = hashDeliveryKey(deliveryKey);

  const publicId = await prisma.$transaction(async (tx) => {
    const link = await tx.downloadAccessLink.findUnique({
      where: { tokenHash },
      select: {
        orderId: true,
        usedAt: true,
        expiresAt: true,
        order: { select: { status: true } },
      },
    });
    const decision = consumeAccessLink(
      link
        ? { tokenHash, orderId: link.orderId, usedAt: link.usedAt, expiresAt: link.expiresAt }
        : null,
      now,
    );
    if (!link || !decision.ok || link.order.status !== "PAID") return null;

    const updated = await tx.downloadAccessLink.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (updated.count !== 1) return null;

    const count = await tx.downloadAccessCredential.count({ where: { orderId: link.orderId } });
    if (count >= 10) {
      const oldest = await tx.downloadAccessCredential.findFirst({
        where: { orderId: link.orderId },
        orderBy: { createdAt: "asc" },
        select: { keyHash: true },
      });
      if (oldest) await tx.downloadAccessCredential.delete({ where: { keyHash: oldest.keyHash } });
    }
    await tx.downloadAccessCredential.create({ data: { keyHash, orderId: link.orderId } });
    return link.orderId;
  });

  if (!publicId || !isPublicId(publicId)) return { ok: false };
  return { ok: true, publicId, deliveryKey };
}

export { isDatabaseUnavailable } from "@/lib/db-error";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}

function pieceLabel(artwork: Prisma.JsonValue): string {
  if (typeof artwork !== "object" || artwork === null || Array.isArray(artwork) || !("businessName" in artwork)) {
    return "Tu pieza";
  }
  const name = artwork.businessName;
  if (typeof name !== "string") return "Tu pieza";
  const label = name.replace(/[\r\n]/g, " ").trim();
  return label.length > 0 ? label.slice(0, 80) : "Tu pieza";
}

function isOrderStatus(value: string): value is OrderStatus {
  return orderStatuses.some((status) => status === value);
}
