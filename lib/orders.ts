import { Prisma } from "@prisma/client";
import { ARTWORK_VERSION, COMMERCIAL_ARTWORK_VERSION, COUNTER_ARTWORK_VERSION, PREMIUM_ARTWORK_VERSION, PRESS_ARTWORK_VERSION, SIGNAGE_ARTWORK_VERSION, STUDIO_ARTWORK_VERSION } from "@/lib/artwork";
import { prisma } from "@/lib/db";
import { orderDeliverable, orderStatuses, type OrderStatus } from "@/lib/delivery";
import { readArtworkSnapshot, type OrderDraft } from "@/lib/order-draft";
import { ACCESS_TOKEN_PATTERN, consumeAccessLink, hashAccessToken, issueAccessLink, linkCapOpen, type AccessLinkRecord } from "@/lib/access-link";
import { createDeliveryKey, deliveryKeysMatch, hashDeliveryKey } from "@/lib/payments/access";
import { paymentEnvironmentMode } from "@/lib/payments/checkout-policy";
import { decidePayment, type VerifiedPayment } from "@/lib/payments/decision";
import { PIECE_CURRENCY, PIECE_PRICE_ARS } from "@/lib/pricing";
import { createPublicId, isPublicId } from "@/lib/public-id";
import { orderArtworkLabel } from "@/lib/order-label";
import { STUDIO_COMMERCIAL_ARTWORK_VERSION } from "@/lib/studio/commercial-artwork";
import { createPrismaStudioAssetStore, retainStudioAssetsForOrder } from "@/lib/studio/assets/index";
import {
  deriveStudioV8DeliveryKey,
  hashStudioOrderIdempotencyKey,
  hashStudioOrderRequest,
  orderAccessSecret,
  studioOrderRequestHashesMatch,
} from "@/lib/studio/order-idempotency";
import { dispatchPurchaseAccessMail } from "@/lib/purchase-notify";
import { logError } from "@/lib/log";
import { openStudioArtwork, sealStudioArtwork } from "@/lib/studio/artwork-seal";

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

/** Free-first claim for one browser cookie and one email (both hashed). */
export type FreeOrderClaim = { visitorKeyHash: string; emailHash: string };

export type SavedOrder = { publicId: string; deliveryKey: string; status: "PENDING" | "FREE" };

/**
 * Create an order. With `free`, a Studio v8 order is created as FREE (amount 0)
 * when the claim is still unused; otherwise it falls back to a normal PENDING
 * order, or throws "free-unavailable" when `allowPaid` is false (sales closed).
 */
export async function savePendingOrder(
  draft: OrderDraft,
  options: { free?: FreeOrderClaim | null; allowPaid?: boolean } = {},
): Promise<SavedOrder> {
  if (draft.amountArs !== PIECE_PRICE_ARS || draft.currency !== PIECE_CURRENCY) {
    throw new Error("order-price");
  }
  if (!draft.artwork.href) {
    throw new Error("order-artwork");
  }

  if (draft.artwork.version === STUDIO_COMMERCIAL_ARTWORK_VERSION) {
    return savePendingStudioV8Order(draft, options.free ?? null, options.allowPaid ?? true);
  }
  if (options.allowPaid === false) {
    throw new Error("free-unavailable");
  }

  if (
    draft.artwork.version !== ARTWORK_VERSION &&
    draft.artwork.version !== STUDIO_ARTWORK_VERSION &&
    draft.artwork.version !== COMMERCIAL_ARTWORK_VERSION &&
    draft.artwork.version !== COUNTER_ARTWORK_VERSION &&
    draft.artwork.version !== SIGNAGE_ARTWORK_VERSION &&
    draft.artwork.version !== PRESS_ARTWORK_VERSION &&
    draft.artwork.version !== PREMIUM_ARTWORK_VERSION
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
      return { publicId, deliveryKey, status: "PENDING" };
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 2) continue;
      throw error;
    }
  }

  throw new Error("order-id");
}

/**
 * Create a PENDING Studio v8 order and retain draft-owned assets atomically.
 * Idempotency is enforced by StudioOrderAttempt unique(draftKeyHash, idempotencyKeyHash).
 * deliveryKey is derived (not rotated) so lost responses can re-mint the same cookie.
 */
async function savePendingStudioV8Order(
  draft: OrderDraft,
  freeClaim: FreeOrderClaim | null,
  allowPaid: boolean,
): Promise<SavedOrder> {
  if (draft.artwork.version !== STUDIO_COMMERCIAL_ARTWORK_VERSION) {
    throw new Error("order-artwork");
  }
  if (!draft.studioDraftKeyHash) {
    throw new Error("order-assets");
  }
  if (!draft.studioIdempotencyKey) {
    throw new Error("order-idempotency");
  }

  const secret = orderAccessSecret();
  if (!secret) {
    throw new Error("order-access-secret");
  }

  const artwork = draft.artwork;
  const assetIds = artwork.assetIds;
  const draftKeyHash = draft.studioDraftKeyHash;
  const idempotencyKey = draft.studioIdempotencyKey;
  const idempotencyKeyHash = hashStudioOrderIdempotencyKey(idempotencyKey);
  const artworkJson = JSON.stringify(artwork);
  const requestHash = hashStudioOrderRequest({
    buyerEmail: draft.buyerEmail,
    artworkJson,
  });

  const existing = await resolveStudioV8IdempotentReplay({
    draftKeyHash,
    idempotencyKeyHash,
    requestHash,
    idempotencyKey,
    secret,
  });
  if (existing) return existing;

  // Cheap pre-check; the unique keys on FreeQrClaim are what actually enforce one per browser/email.
  let free = freeClaim && !(await freeClaimTaken(freeClaim)) ? freeClaim : null;
  if (!free && !allowPaid) throw new Error("free-unavailable");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const publicId = createPublicId();
    const deliveryKey = deriveStudioV8DeliveryKey({
      publicId,
      draftKeyHash,
      idempotencyKey,
      secret,
    });
    try {
      await prisma.$transaction(async (tx) => {
        await tx.order.create({
          data: {
            id: publicId,
            status: free ? "FREE" : "PENDING",
            amountArs: free ? 0 : PIECE_PRICE_ARS,
            currency: PIECE_CURRENCY,
            artworkVersion: STUDIO_COMMERCIAL_ARTWORK_VERSION,
            // Wi-Fi passwords and contact data inside the QR are encrypted at rest.
            artwork: sealStudioArtwork(artwork, secret) as unknown as Prisma.InputJsonValue,
            deliveryKeyHash: hashDeliveryKey(deliveryKey),
            buyerEmail: draft.buyerEmail,
          },
        });

        if (free) {
          await tx.freeQrClaim.create({
            data: { visitorKeyHash: free.visitorKeyHash, emailHash: free.emailHash, orderId: publicId },
          });
        }

        await tx.studioOrderAttempt.create({
          data: {
            draftKeyHash,
            idempotencyKeyHash,
            requestHash,
            orderId: publicId,
          },
        });

        if (assetIds.length > 0) {
          const store = createPrismaStudioAssetStore(tx);
          const retained = await retainStudioAssetsForOrder({
            store,
            draftKeyHash,
            orderId: publicId,
            assetIds,
          });
          if (retained.rejected.length > 0) {
            throw new Error("order-assets");
          }
        }
      });

      return { publicId, deliveryKey, status: free ? "FREE" : "PENDING" };
    } catch (error) {
      if (error instanceof Error && error.message === "order-assets") throw error;
      if (isUniqueViolation(error)) {
        const raced = await resolveStudioV8IdempotentReplay({
          draftKeyHash,
          idempotencyKeyHash,
          requestHash,
          idempotencyKey,
          secret,
        });
        if (raced) return raced;
        // A concurrent request won the free claim: continue as a normal order, or stop.
        if (free && (await freeClaimTaken(free))) {
          free = null;
          if (!allowPaid) throw new Error("free-unavailable");
        }
        if (attempt < 2) continue;
      }
      throw error;
    }
  }

  throw new Error("order-id");
}

async function resolveStudioV8IdempotentReplay(input: {
  draftKeyHash: string;
  idempotencyKeyHash: string;
  requestHash: string;
  idempotencyKey: string;
  secret: string;
}): Promise<SavedOrder | null> {
  const attempt = await prisma.studioOrderAttempt.findUnique({
    where: {
      draftKeyHash_idempotencyKeyHash: {
        draftKeyHash: input.draftKeyHash,
        idempotencyKeyHash: input.idempotencyKeyHash,
      },
    },
    select: { orderId: true, requestHash: true },
  });
  if (!attempt) return null;
  if (!studioOrderRequestHashesMatch(attempt.requestHash, input.requestHash)) {
    throw new Error("order-idempotency-conflict");
  }

  const deliveryKey = deriveStudioV8DeliveryKey({
    publicId: attempt.orderId,
    draftKeyHash: input.draftKeyHash,
    idempotencyKey: input.idempotencyKey,
    secret: input.secret,
  });
  const order = await prisma.order.findUnique({
    where: { id: attempt.orderId },
    select: { deliveryKeyHash: true, status: true },
  });
  if (!order || !deliveryKeysMatch(deliveryKey, order.deliveryKeyHash)) {
    throw new Error("order-idempotency");
  }
  return { publicId: attempt.orderId, deliveryKey, status: order.status === "FREE" ? "FREE" : "PENDING" };
}

/** True when this browser or this email already used the free order. */
export async function freeClaimTaken(claim: FreeOrderClaim): Promise<boolean> {
  const found = await prisma.freeQrClaim.findFirst({
    where: { OR: [{ visitorKeyHash: claim.visitorKeyHash }, { emailHash: claim.emailHash }] },
    select: { orderId: true },
  });
  return found !== null;
}

/** True when this browser already used the free order. */
export async function visitorFreeClaimUsed(visitorKeyHash: string): Promise<boolean> {
  const found = await prisma.freeQrClaim.findUnique({ where: { visitorKeyHash }, select: { orderId: true } });
  return found !== null;
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

  const artwork = readArtworkSnapshot(openStudioArtwork(row.artwork, orderAccessSecret()));
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

  const artwork = readArtworkSnapshot(openStudioArtwork(row.artwork, orderAccessSecret()));
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
  options?: {
    /**
     * Test hook invoked only after a durable outbox row was enqueued.
     * Production callers omit this; the default dispatches pending purchase mail.
     */
    dispatch?: (orderPublicId: string) => Promise<unknown>;
  },
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

  // PAID + outbox intent are atomic. If enqueue fails, the whole txn rolls back and MP can retry.
  const enqueued = await prisma.$transaction(async (tx) => {
    const paid = await tx.order.updateMany({
      where: { id: publicId, status: "PENDING" },
      data: {
        status: "PAID",
        mercadoPagoPaymentId: decision.paymentId,
        mercadoPagoPaymentStatus: decision.paymentStatus,
        paymentCheckedAt: checkedAt,
        paidAt: decision.paidAt,
      },
    });
    if (paid.count !== 1) return false;

    await tx.mailNotification.create({
      data: {
        orderId: publicId,
        kind: "PURCHASE_ACCESS",
        status: "PENDING",
        nextAttemptAt: checkedAt,
      },
    });
    return true;
  });

  if (!enqueued) return;

  if (options?.dispatch) {
    try {
      await options.dispatch(publicId);
    } catch (error) {
      logError("mail.purchase-dispatch-failed", error, { publicId });
    }
    return;
  }

  // The purchase mail renders and attaches the three files, which takes seconds: do not hold the
  // payment notification open for it. The durable queue (cron) retries anything that does not go out.
  void defaultPurchaseDispatch(publicId).catch((error) => {
    logError("mail.purchase-dispatch-failed", error, { publicId });
  });
}

async function defaultPurchaseDispatch(orderPublicId: string): Promise<void> {
  await dispatchPurchaseAccessMail({ orderId: orderPublicId, limit: 1 });
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
    where: { buyerEmail: email, status: { in: ["PAID", "FREE"] } },
    orderBy: [{ paidAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
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
  if (!order || !orderDeliverable(order.status)) return "unavailable";
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
    if (!link || !decision.ok || !orderDeliverable(link.order.status)) return null;

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
  return orderArtworkLabel(artwork);
}

function isOrderStatus(value: string): value is OrderStatus {
  return orderStatuses.some((status) => status === value);
}
