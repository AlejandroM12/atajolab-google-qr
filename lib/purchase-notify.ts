import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import {
  accessLinkUrl,
  ACCESS_TOKEN_PATTERN,
  hashAccessToken,
  issueAccessLink,
  linkCapOpen,
  MAX_ACTIVE_ACCESS_LINKS,
  PURCHASE_ACCESS_LINK_TTL_MS,
  type AccessLinkRecord,
} from "@/lib/access-link";
import { isDatabaseUnavailable } from "@/lib/db-error";
import { supportMailbox } from "@/lib/legal";
import { logError } from "@/lib/log";
import { PIECE_CURRENCY, PIECE_PRICE_ARS } from "@/lib/pricing";
import { buildPurchaseEmail } from "@/lib/purchase-email";
import { fitsInMail, loadPurchaseArtwork, renderPurchaseFiles, type PurchaseFile } from "@/lib/purchase-files";
import { prisma } from "@/lib/db";
import { createMailSender, type MailResult, type MailSender } from "@/lib/mail";
import { orderArtworkLabel } from "@/lib/order-label";
import { appOrigin } from "@/lib/payments/checkout-policy";
import { isPublicId } from "@/lib/public-id";
import { orderAccessSecret } from "@/lib/studio/order-idempotency";

export const PURCHASE_ACCESS_KIND = "PURCHASE_ACCESS" as const;
export const MAIL_NOTIFY_MAX_ATTEMPTS = 8;
export const MAIL_NOTIFY_STALE_MS = 5 * 60 * 1000;
/** @deprecated Unused: claim() is the concurrency control. Kept for docs/compat. */
export const MAIL_DISPATCH_LOCK_KEY = 88442211;

export type PurchaseNotifyOrder = {
  status: string;
  buyerEmail: string | null;
  artwork: unknown;
  amountArs?: number;
  currency?: string;
  paidAt?: Date | null;
};

/** Renders the files of a PAID order. Throws when they cannot be produced. */
export type PurchaseFilesLoader = (orderId: string) => Promise<PurchaseFile[]>;

/** Claims 1..N try to attach the files; later ones send the mail with the download button only. */
export const MAIL_ATTACHMENT_ATTEMPTS = 3;

export type MailNotificationRow = {
  id: string;
  orderId: string;
  kind: typeof PURCHASE_ACCESS_KIND | string;
  status: "PENDING" | "PROCESSING" | "SENT" | "FAILED" | string;
  attempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
  sentAt: Date | null;
  accessTokenCipher: Uint8Array | Buffer | null;
  accessTokenHash: string | null;
  updatedAt: Date;
};

export type PurchaseNotifyStore = {
  findOrder(publicId: string): Promise<PurchaseNotifyOrder | null>;
  /** Puts a finished or failed notification back in the queue for a controlled resend. */
  requeue(orderId: string, now: Date): Promise<"requeued" | "busy">;
  countActiveLinks(orderId: string, now: Date): Promise<number>;
  saveLink(record: AccessLinkRecord): Promise<boolean>;
  revoke(tokenHashes: string[]): Promise<void>;
  findLink(
    tokenHash: string,
  ): Promise<{ orderId: string; expiresAt: Date; usedAt: Date | null } | null>;
  findDue(now: Date, limit: number, orderId?: string): Promise<MailNotificationRow[]>;
  reclaimStale(now: Date, staleBefore: Date): Promise<number>;
  claim(id: string, now: Date): Promise<MailNotificationRow | null>;
  markSent(id: string, now: Date): Promise<void>;
  markRetry(id: string, nextAttemptAt: Date, error: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  clearToken(id: string): Promise<void>;
  saveToken(id: string, cipher: Buffer, tokenHash: string): Promise<void>;
};

export type DispatchPurchaseResult = {
  claimed: number;
  sent: number;
  held: number;
  retryable: number;
  failed: number;
  skipped: number;
};

/**
 * Best-effort immediate send after PAID enqueue. Prefer the cron/job for retries.
 * @deprecated Prefer enqueue via applyVerifiedPayment + dispatchPurchaseAccessMail.
 */
export async function notifyPaidOrderAccess(
  publicId: string,
  deps: {
    now?: Date;
    sender?: MailSender;
    originHref?: string | null;
    store?: PurchaseNotifyStore;
    secret?: string;
  } = {},
): Promise<"sent" | "held" | "skipped" | "refused" | "retryable"> {
  if (!isPublicId(publicId)) return "skipped";
  const result = await dispatchPurchaseAccessMail({
    now: deps.now,
    sender: deps.sender,
    originHref: deps.originHref,
    store: deps.store,
    secret: deps.secret,
    orderId: publicId,
    limit: 1,
  });
  if (result.sent > 0) return "sent";
  if (result.held > 0) return "held";
  if (result.retryable > 0) return "retryable";
  if (result.failed > 0) return "refused";
  return "skipped";
}

export async function dispatchPurchaseAccessMail(
  deps: {
    now?: Date;
    sender?: MailSender;
    originHref?: string | null;
    store?: PurchaseNotifyStore;
    secret?: string;
    orderId?: string;
    limit?: number;
    /** Renders the files to attach. Default: the real exporters, only with the real database store. */
    loadFiles?: PurchaseFilesLoader | null;
  } = {},
): Promise<DispatchPurchaseResult> {
  const now = deps.now ?? new Date();
  const store = deps.store ?? prismaPurchaseNotifyStore();
  const origin =
    deps.originHref !== undefined
      ? deps.originHref
      : appOrigin(process.env.APP_URL)?.href ?? null;
  const sender = deps.sender ?? createMailSender();
  const secret = deps.secret ?? orderAccessSecret(process.env);
  const limit = Math.max(1, Math.min(deps.limit ?? 20, 50));
  const loadFiles = deps.loadFiles !== undefined ? deps.loadFiles : deps.store ? null : renderStoredPurchaseFiles;

  await store.reclaimStale(now, new Date(now.getTime() - MAIL_NOTIFY_STALE_MS));

  const due = await store.findDue(now, limit, deps.orderId);
  const tally: DispatchPurchaseResult = {
    claimed: 0,
    sent: 0,
    held: 0,
    retryable: 0,
    failed: 0,
    skipped: 0,
  };

  if (!secret) {
    for (const row of due) {
      const claimed = await store.claim(row.id, now);
      if (!claimed) {
        tally.skipped += 1;
        continue;
      }
      tally.claimed += 1;
      await scheduleRetry(claimed, store, now, "missing-secret");
      tally.retryable += 1;
    }
    return tally;
  }

  for (const row of due) {
    const claimed = await store.claim(row.id, now);
    if (!claimed) {
      tally.skipped += 1;
      continue;
    }
    tally.claimed += 1;
    const outcome = await processClaimedNotification(claimed, {
      now,
      store,
      sender,
      origin,
      secret,
      loadFiles,
    });
    tally[outcome] += 1;
  }

  return tally;
}

export function mailNotifyBackoffMs(attemptsAfterClaim: number): number {
  const steps = [
    60_000,
    5 * 60_000,
    15 * 60_000,
    60 * 60_000,
    6 * 60 * 60_000,
    24 * 60 * 60_000,
  ];
  const index = Math.max(0, Math.min(attemptsAfterClaim - 1, steps.length - 1));
  return steps[index] ?? steps[steps.length - 1]!;
}

export function sealAccessToken(token: string, secret: string): Buffer {
  const key = createHash("sha256").update(`mail-notify:${secret}`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

export function openAccessToken(sealed: Uint8Array | Buffer, secret: string): string | null {
  try {
    const buf = Buffer.from(sealed);
    if (buf.length < 12 + 16 + 1) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const key = createHash("sha256").update(`mail-notify:${secret}`).digest();
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const token = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    return ACCESS_TOKEN_PATTERN.test(token) ? token : null;
  } catch {
    return null;
  }
}

export function mailDispatchAuthorized(
  header: string | null,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expected = env.MAIL_DISPATCH_SECRET?.trim() ?? "";
  if (!expected || expected.length < 16) return false;
  if (!header) return false;
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : header.trim();
  if (bearer.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= bearer.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}

/**
 * Safe classification for ops logs / JSON. Never includes tokens, emails, or URLs with credentials.
 */
export function describeMailDispatchError(error: unknown): {
  name: string;
  kind: "database-unavailable" | "prisma" | "transaction" | "pooler" | "unknown";
  prismaCode?: string;
  detail?: string;
} {
  if (isDatabaseUnavailable(error)) {
    return { name: "DatabaseUnavailable", kind: "database-unavailable" };
  }

  const name =
    error instanceof Error
      ? error.name || "Error"
      : typeof error === "object" && error !== null && "name" in error
        ? String((error as { name?: unknown }).name ?? "unknown")
        : "unknown";

  const prismaCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    /^P\d{4}$/.test((error as { code: string }).code)
      ? (error as { code: string }).code
      : undefined;

  const rawMessage = error instanceof Error ? error.message : "";
  const detail = rawMessage ? sanitizeDispatchLogDetail(rawMessage) : undefined;
  const lower = rawMessage.toLowerCase();

  if (
    lower.includes("prepared statement") ||
    lower.includes("pgbouncer") ||
    lower.includes("max clients") ||
    (lower.includes("pool") && lower.includes("timeout"))
  ) {
    return { name, kind: "pooler", prismaCode, detail };
  }

  if (
    lower.includes("transaction not found") ||
    lower.includes("transaction api error") ||
    lower.includes("interactive transaction") ||
    prismaCode === "P2028"
  ) {
    return { name, kind: "transaction", prismaCode, detail };
  }

  if (prismaCode) {
    return { name, kind: "prisma", prismaCode, detail };
  }

  return { name, kind: "unknown", detail };
}

function sanitizeDispatchLogDetail(message: string): string {
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgresql://***")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer ***")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "***@***")
    .slice(0, 240);
}

function logMailDispatchFailure(error: unknown): void {
  const described = describeMailDispatchError(error);
  console.error(
    "mail dispatch failed",
    JSON.stringify({
      name: described.name,
      kind: described.kind,
      prismaCode: described.prismaCode ?? null,
      detail: described.detail ?? null,
    }),
  );
}

/**
 * Cron entry: drain due MailNotification rows.
 *
 * Concurrency is enforced by atomic claim() (UPDATE … WHERE status=PENDING), not by a
 * long-lived interactive Prisma transaction. Holding Resend/HTTP inside `$transaction`
 * breaks on Neon poolers and starves the connection pool even on direct URLs.
 */
export async function runMailDispatchJob(
  deps: {
    now?: Date;
    sender?: MailSender;
    originHref?: string | null;
    store?: PurchaseNotifyStore;
    secret?: string;
    limit?: number;
  } = {},
): Promise<
  | DispatchPurchaseResult
  | { ok: false; error: "lock-failed" | "dispatch-failed"; reason?: string }
> {
  try {
    return await dispatchPurchaseAccessMail(deps);
  } catch (error) {
    if (isDatabaseUnavailable(error)) throw error;
    logMailDispatchFailure(error);
    const described = describeMailDispatchError(error);
    const reason = described.prismaCode ?? described.kind;
    return { ok: false, error: "dispatch-failed", reason };
  }
}

async function processClaimedNotification(
  row: MailNotificationRow,
  deps: {
    now: Date;
    store: PurchaseNotifyStore;
    sender: MailSender;
    origin: string | null;
    secret: string;
    loadFiles: PurchaseFilesLoader | null;
  },
): Promise<"sent" | "held" | "retryable" | "failed" | "skipped"> {
  if (row.attempts > MAIL_NOTIFY_MAX_ATTEMPTS) {
    await failAndRevoke(row, deps.store, "max-attempts");
    return "failed";
  }

  const order = await deps.store.findOrder(row.orderId);
  if (!order || order.status !== "PAID" || !order.buyerEmail) {
    await failAndRevoke(row, deps.store, "order-not-payable");
    return "failed";
  }

  if (!deps.origin) {
    await scheduleRetry(row, deps.store, deps.now, "missing-origin");
    return "retryable";
  }

  if (!deps.sender.canDispatch) {
    await scheduleRetry(row, deps.store, deps.now, "mail-unconfigured");
    return "retryable";
  }

  const prepared = await ensureAccessToken(row, deps);
  if (!prepared.ok) {
    if (prepared.fatal) {
      await failAndRevoke(row, deps.store, prepared.error);
      return "failed";
    }
    await scheduleRetry(row, deps.store, deps.now, prepared.error);
    return "retryable";
  }

  // Claimed row may predate seal/save — always revoke using the live token hash.
  const liveRow: MailNotificationRow = {
    ...row,
    accessTokenHash: prepared.tokenHash,
  };

  const accessUrl = accessLinkUrl(deps.origin, prepared.token);
  if (!accessUrl) {
    await failAndRevoke(liveRow, deps.store, "mail-build");
    return "failed";
  }

  // The files travel with the mail while the first attempts work; if rendering or the provider keeps
  // failing, the mail still goes out with the download button, never losing the purchase notice.
  const tryAttachments = deps.loadFiles !== null && row.attempts <= MAIL_ATTACHMENT_ATTEMPTS;
  let files: PurchaseFile[] = [];
  if (tryAttachments && deps.loadFiles) {
    try {
      files = await deps.loadFiles(row.orderId);
    } catch (error) {
      logError("mail.purchase-files-failed", error, { publicId: row.orderId, attempt: row.attempts });
      await scheduleRetry(liveRow, deps.store, deps.now, "files-render");
      return "retryable";
    }
  }

  const compose = (withFiles: boolean) => {
    const mail = buildPurchaseEmail({
      origin: deps.origin!,
      label: orderArtworkLabel(order.artwork),
      publicId: row.orderId,
      amountArs: order.amountArs ?? PIECE_PRICE_ARS,
      currency: order.currency ?? PIECE_CURRENCY,
      paidAt: order.paidAt ?? null,
      accessUrl,
      files: withFiles
        ? files.map((file) => ({ format: file.format, filename: file.filename, bytes: file.content.length }))
        : (["png", "pdf", "svg"] as const).map((format) => ({ format, filename: null, bytes: null })),
      attached: withFiles,
      supportEmail: supportMailbox(),
    });
    return {
      to: order.buyerEmail!,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      ...(supportMailbox() ? { replyTo: supportMailbox()! } : {}),
      ...(withFiles ? { attachments: files } : {}),
    };
  };

  const attach = files.length > 0 && fitsInMail(files);
  let result: MailResult = "refused";
  try {
    result = await deps.sender.send(compose(attach));
  } catch {
    result = "retryable";
  }
  if (attach && result === "refused") {
    // The provider rejected the message with its files (size, type): fall back to the download button.
    logError("mail.purchase-attachments-refused", undefined, { publicId: row.orderId });
    try {
      result = await deps.sender.send(compose(false));
    } catch {
      result = "retryable";
    }
  }

  if (result === "sent" || result === "held") {
    await deps.store.markSent(row.id, deps.now);
    await deps.store.clearToken(row.id);
    return result === "sent" ? "sent" : "held";
  }

  if (result === "retryable") {
    await scheduleRetry(liveRow, deps.store, deps.now, "provider-temporary");
    return "retryable";
  }

  await failAndRevoke(liveRow, deps.store, "provider-refused");
  return "failed";
}

async function renderStoredPurchaseFiles(orderId: string): Promise<PurchaseFile[]> {
  const artwork = await loadPurchaseArtwork(orderId);
  if (!artwork) throw new Error("purchase-artwork-unreadable");
  return renderPurchaseFiles(artwork, orderId);
}

/**
 * Controlled resend of the purchase mail (operator action). Only a PAID order with a mail address qualifies;
 * nothing is charged and the access link is a fresh one. Mail that is still queued or being sent is left alone.
 */
export async function resendPurchaseMail(
  orderId: string,
  deps: { now?: Date; store?: PurchaseNotifyStore } = {},
): Promise<"requeued" | "busy" | "not-payable"> {
  const store = deps.store ?? prismaPurchaseNotifyStore();
  const order = await store.findOrder(orderId);
  if (!order || order.status !== "PAID" || !order.buyerEmail) return "not-payable";
  return store.requeue(orderId, deps.now ?? new Date());
}

async function ensureAccessToken(
  row: MailNotificationRow,
  deps: {
    now: Date;
    store: PurchaseNotifyStore;
    secret: string;
  },
): Promise<
  { ok: true; token: string; tokenHash: string } | { ok: false; fatal: boolean; error: string }
> {
  if (row.accessTokenCipher && row.accessTokenHash) {
    const token = openAccessToken(row.accessTokenCipher, deps.secret);
    if (token && hashAccessToken(token) === row.accessTokenHash) {
      const link = await deps.store.findLink(row.accessTokenHash);
      if (
        link &&
        link.orderId === row.orderId &&
        link.usedAt === null &&
        link.expiresAt.getTime() > deps.now.getTime()
      ) {
        return { ok: true, token, tokenHash: row.accessTokenHash };
      }
    }
    if (row.accessTokenHash) await deps.store.revoke([row.accessTokenHash]);
    await deps.store.clearToken(row.id);
  }

  const active = await deps.store.countActiveLinks(row.orderId, deps.now);
  if (!linkCapOpen(active) || active >= MAX_ACTIVE_ACCESS_LINKS) {
    return { ok: false, fatal: false, error: "link-cap" };
  }

  const issued = issueAccessLink(row.orderId, deps.now, PURCHASE_ACCESS_LINK_TTL_MS);
  const saved = await deps.store.saveLink(issued.record);
  if (!saved) return { ok: false, fatal: false, error: "link-save" };

  let cipher: Buffer;
  try {
    cipher = sealAccessToken(issued.token, deps.secret);
  } catch {
    await deps.store.revoke([issued.record.tokenHash]);
    return { ok: false, fatal: true, error: "token-seal" };
  }
  await deps.store.saveToken(row.id, cipher, issued.record.tokenHash);
  return { ok: true, token: issued.token, tokenHash: issued.record.tokenHash };
}

async function scheduleRetry(
  row: MailNotificationRow,
  store: PurchaseNotifyStore,
  now: Date,
  error: string,
): Promise<void> {
  if (row.attempts >= MAIL_NOTIFY_MAX_ATTEMPTS) {
    await failAndRevoke(row, store, error);
    return;
  }
  const next = new Date(now.getTime() + mailNotifyBackoffMs(row.attempts));
  await store.markRetry(row.id, next, error);
}

async function failAndRevoke(
  row: MailNotificationRow,
  store: PurchaseNotifyStore,
  error: string,
): Promise<void> {
  if (row.accessTokenHash) await store.revoke([row.accessTokenHash]);
  await store.clearToken(row.id);
  await store.markFailed(row.id, error);
}

type PrismaLike = {
  order: { findUnique: typeof prisma.order.findUnique };
  downloadAccessLink: {
    count: typeof prisma.downloadAccessLink.count;
    create: typeof prisma.downloadAccessLink.create;
    deleteMany: typeof prisma.downloadAccessLink.deleteMany;
    findUnique: typeof prisma.downloadAccessLink.findUnique;
  };
  mailNotification: {
    findMany: typeof prisma.mailNotification.findMany;
    updateMany: typeof prisma.mailNotification.updateMany;
    update: typeof prisma.mailNotification.update;
    findUnique: typeof prisma.mailNotification.findUnique;
    create: typeof prisma.mailNotification.create;
  };
};

function prismaPurchaseNotifyStore(client: PrismaLike = prisma): PurchaseNotifyStore {
  return {
    async findOrder(publicId) {
      return client.order.findUnique({
        where: { id: publicId },
        select: { status: true, buyerEmail: true, artwork: true, amountArs: true, currency: true, paidAt: true },
      });
    },
    async requeue(orderId, now) {
      const reset = await client.mailNotification.updateMany({
        where: { orderId, kind: PURCHASE_ACCESS_KIND, status: { in: ["SENT", "FAILED"] } },
        data: { status: "PENDING", attempts: 0, nextAttemptAt: now, lastError: null },
      });
      if (reset.count === 1) return "requeued";
      const existing = await client.mailNotification.findUnique({
        where: { orderId_kind: { orderId, kind: PURCHASE_ACCESS_KIND } },
        select: { id: true },
      });
      if (existing) return "busy";
      await client.mailNotification.create({
        data: { orderId, kind: PURCHASE_ACCESS_KIND, status: "PENDING", nextAttemptAt: now },
      });
      return "requeued";
    },
    async countActiveLinks(orderId, now) {
      return client.downloadAccessLink.count({
        where: { orderId, usedAt: null, expiresAt: { gt: now } },
      });
    },
    async saveLink(record) {
      const active = await client.downloadAccessLink.count({
        where: { orderId: record.orderId, usedAt: null, expiresAt: { gt: new Date() } },
      });
      if (!linkCapOpen(active)) return false;
      try {
        await client.downloadAccessLink.create({
          data: {
            tokenHash: record.tokenHash,
            orderId: record.orderId,
            expiresAt: record.expiresAt,
          },
        });
        return true;
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code?: unknown }).code === "P2002"
        ) {
          return false;
        }
        throw error;
      }
    },
    async revoke(tokenHashes) {
      if (tokenHashes.length === 0) return;
      await client.downloadAccessLink.deleteMany({
        where: { tokenHash: { in: tokenHashes }, usedAt: null },
      });
    },
    async findLink(tokenHash) {
      return client.downloadAccessLink.findUnique({
        where: { tokenHash },
        select: { orderId: true, expiresAt: true, usedAt: true },
      });
    },
    async findDue(now, limit, orderId) {
      return client.mailNotification.findMany({
        where: {
          status: "PENDING",
          nextAttemptAt: { lte: now },
          kind: PURCHASE_ACCESS_KIND,
          ...(orderId ? { orderId } : {}),
        },
        orderBy: { nextAttemptAt: "asc" },
        take: limit,
      });
    },
    async reclaimStale(now, staleBefore) {
      const result = await client.mailNotification.updateMany({
        where: { status: "PROCESSING", updatedAt: { lt: staleBefore } },
        data: { status: "PENDING", nextAttemptAt: now, lastError: "stale-processing" },
      });
      return result.count;
    },
    async claim(id, now) {
      const updated = await client.mailNotification.updateMany({
        where: { id, status: "PENDING", nextAttemptAt: { lte: now } },
        data: { status: "PROCESSING", attempts: { increment: 1 }, lastError: null },
      });
      if (updated.count !== 1) return null;
      return client.mailNotification.findUnique({ where: { id } });
    },
    async markSent(id, now) {
      await client.mailNotification.update({
        where: { id },
        data: { status: "SENT", sentAt: now, lastError: null },
      });
    },
    async markRetry(id, nextAttemptAt, error) {
      await client.mailNotification.update({
        where: { id },
        data: { status: "PENDING", nextAttemptAt, lastError: error },
      });
    },
    async markFailed(id, error) {
      await client.mailNotification.update({
        where: { id },
        data: { status: "FAILED", lastError: error },
      });
    },
    async clearToken(id) {
      await client.mailNotification.update({
        where: { id },
        data: { accessTokenCipher: null, accessTokenHash: null },
      });
    },
    async saveToken(id, cipher, tokenHash) {
      await client.mailNotification.update({
        where: { id },
        data: {
          accessTokenCipher: Uint8Array.from(cipher),
          accessTokenHash: tokenHash,
        },
      });
    },
  };
}
