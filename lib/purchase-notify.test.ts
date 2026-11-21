import assert from "node:assert/strict";
import {
  ACCESS_TOKEN_PATTERN,
  hashAccessToken,
  recoveryMail,
  type AccessLinkRecord,
} from "./access-link.ts";
import { orderArtworkLabel } from "./order-label.ts";
import { buildPurchaseEmail } from "./purchase-email.ts";
import type { MailMessage, MailResult, MailSender } from "./mail.ts";
import type { PurchaseFile } from "./purchase-files.ts";
import {
  artworkFilename,
  studioCommercialFilename,
} from "./print/download.ts";
import {
  describeMailDispatchError,
  dispatchPurchaseAccessMail,
  mailDispatchAuthorized,
  mailNotifyBackoffMs,
  openAccessToken,
  PURCHASE_ACCESS_KIND,
  resendPurchaseMail,
  runMailDispatchJob,
  sealAccessToken,
  type MailNotificationRow,
  type PurchaseNotifyOrder,
  type PurchaseNotifyStore,
} from "./purchase-notify.ts";
import {
  createRecoveryLimiter,
  recoveryAcknowledgement,
  recoveryTargets,
  requestRecovery,
  type RecoveryCandidate,
  type RecoveryStore,
} from "./recovery.ts";
import {
  STUDIO_COMMERCIAL_ARTWORK_VERSION,
  type StudioCommercialArtworkV8,
} from "./studio/commercial-artwork.ts";

const now = new Date("2026-11-03T18:00:00.000Z");
const origin = "http://localhost:3001";
const publicId = "cccccccccccccccccccccccc";
const buyer = "studio-v8@example.com";
const secret = "purchase-notify-test-secret-32chars!!";

function v8Artwork(title: string): StudioCommercialArtworkV8 {
  return {
    version: STUDIO_COMMERCIAL_ARTWORK_VERSION,
    href: "https://search.google.com/local/writereview?placeid=ChIJ",
    format: { id: "a6", widthMm: 105, heightMm: 148 },
    background: "#ffffff",
    templateId: "corporativo",
    title,
    frozenAt: now.toISOString(),
    assetIds: ["asset-private-id-should-not-leak"],
    document: {
      version: STUDIO_COMMERCIAL_ARTWORK_VERSION,
      format: { id: "a6", widthMm: 105, heightMm: 148 },
      background: "#ffffff",
      templateId: "corporativo",
      layouts: {},
      elements: [],
      parked: [],
    },
  };
}

function v7Artwork(businessName: string) {
  return {
    version: 2,
    href: "https://www.google.com/maps/place/x",
    templateId: "tarjeta-resena",
    businessName,
    headline: "Escaneá",
    foreground: "#14221f",
    background: "#ffffff",
    qrSize: 320,
  };
}

function sender(result: MailResult | (() => MailResult) = "held"): MailSender & {
  messages: MailMessage[];
  calls: number;
} {
  const messages: MailMessage[] = [];
  let calls = 0;
  return {
    mode: "dev-outbox",
    canDispatch: true,
    messages,
    get calls() {
      return calls;
    },
    async send(message) {
      calls += 1;
      messages.push(message);
      return typeof result === "function" ? result() : result;
    },
  };
}

function memoryNotify(order: PurchaseNotifyOrder | null, seed: MailNotificationRow[] = []) {
  const links = new Map<string, AccessLinkRecord>();
  const notes = new Map<string, MailNotificationRow>();
  for (const row of seed) notes.set(row.id, { ...row });

  const store: PurchaseNotifyStore = {
    async findOrder() {
      return order;
    },
    async requeue(orderId, moment) {
      for (const row of notes.values()) {
        if (row.orderId !== orderId) continue;
        if (row.status !== "SENT" && row.status !== "FAILED") return "busy";
        row.status = "PENDING";
        row.attempts = 0;
        row.nextAttemptAt = moment;
        row.lastError = null;
        return "requeued";
      }
      return "busy";
    },
    async countActiveLinks(orderId, moment) {
      let count = 0;
      for (const link of links.values()) {
        if (link.orderId === orderId && link.usedAt === null && link.expiresAt.getTime() > moment.getTime()) {
          count += 1;
        }
      }
      return count;
    },
    async saveLink(record) {
      if (links.has(record.tokenHash)) return false;
      links.set(record.tokenHash, { ...record });
      return true;
    },
    async revoke(tokenHashes) {
      for (const hash of tokenHashes) links.delete(hash);
    },
    async findLink(tokenHash) {
      const link = links.get(tokenHash);
      if (!link) return null;
      return { orderId: link.orderId, expiresAt: link.expiresAt, usedAt: link.usedAt };
    },
    async findDue(moment, limit, orderId) {
      return [...notes.values()]
        .filter(
          (row) =>
            row.status === "PENDING" &&
            row.nextAttemptAt.getTime() <= moment.getTime() &&
            row.kind === PURCHASE_ACCESS_KIND &&
            (!orderId || row.orderId === orderId),
        )
        .sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime())
        .slice(0, limit)
        .map((row) => ({ ...row }));
    },
    async reclaimStale(moment, staleBefore) {
      let count = 0;
      for (const row of notes.values()) {
        if (row.status === "PROCESSING" && row.updatedAt.getTime() < staleBefore.getTime()) {
          row.status = "PENDING";
          row.nextAttemptAt = moment;
          row.lastError = "stale-processing";
          row.updatedAt = moment;
          count += 1;
        }
      }
      return count;
    },
    async claim(id, moment) {
      const row = notes.get(id);
      if (!row || row.status !== "PENDING" || row.nextAttemptAt.getTime() > moment.getTime()) return null;
      row.status = "PROCESSING";
      row.attempts += 1;
      row.lastError = null;
      row.updatedAt = moment;
      return { ...row };
    },
    async markSent(id, moment) {
      const row = notes.get(id);
      if (!row) return;
      row.status = "SENT";
      row.sentAt = moment;
      row.lastError = null;
      row.updatedAt = moment;
    },
    async markRetry(id, nextAttemptAt, error) {
      const row = notes.get(id);
      if (!row) return;
      row.status = "PENDING";
      row.nextAttemptAt = nextAttemptAt;
      row.lastError = error;
      row.updatedAt = nextAttemptAt;
    },
    async markFailed(id, error) {
      const row = notes.get(id);
      if (!row) return;
      row.status = "FAILED";
      row.lastError = error;
      row.updatedAt = now;
    },
    async clearToken(id) {
      const row = notes.get(id);
      if (!row) return;
      row.accessTokenCipher = null;
      row.accessTokenHash = null;
    },
    async saveToken(id, cipher, tokenHash) {
      const row = notes.get(id);
      if (!row) return;
      row.accessTokenCipher = cipher;
      row.accessTokenHash = tokenHash;
    },
  };

  return { store, links, notes };
}

function pendingRow(overrides: Partial<MailNotificationRow> = {}): MailNotificationRow {
  return {
    id: "note-1",
    orderId: publicId,
    kind: PURCHASE_ACCESS_KIND,
    status: "PENDING",
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
    sentAt: null,
    accessTokenCipher: null,
    accessTokenHash: null,
    updatedAt: now,
    ...overrides,
  };
}

function memoryRecovery(orders: RecoveryCandidate[]) {
  const links = new Map<string, AccessLinkRecord>();
  const store: RecoveryStore = {
    async findOrders(email) {
      return orders.filter((order) => order.buyerEmail === email);
    },
    async countActiveLinks(publicIdValue, moment) {
      let count = 0;
      for (const link of links.values()) {
        if (
          link.orderId === publicIdValue &&
          link.usedAt === null &&
          link.expiresAt.getTime() > moment.getTime()
        ) {
          count += 1;
        }
      }
      return count;
    },
    async saveLink(record) {
      if (links.has(record.tokenHash)) return false;
      links.set(record.tokenHash, { ...record });
      return true;
    },
    async revoke(tokenHashes) {
      for (const hash of tokenHashes) links.delete(hash);
    },
  };
  return { store, links };
}

{
  assert.equal(orderArtworkLabel(v8Artwork("Café Studio Sur")), "Café Studio Sur");
  assert.equal(orderArtworkLabel(v7Artwork("Panadería Norte")), "Panadería Norte");
  const mail = buildPurchaseEmail({
    origin,
    label: "Café Studio Sur",
    publicId,
    amountArs: 4900,
    currency: "ARS",
    paidAt: new Date("2026-11-21T15:30:00Z"),
    accessUrl: `${origin}/acceso/${"a".repeat(43)}`,
    files: [
      { format: "png", filename: "studio-clasico-cafe.png", bytes: 220_000 },
      { format: "pdf", filename: "studio-clasico-cafe.pdf", bytes: 90_000 },
      { format: "svg", filename: "studio-clasico-cafe.svg", bytes: 30_000 },
    ],
    attached: true,
    supportEmail: "ayuda@example.com",
  });
  for (const body of [mail.text, mail.html]) {
    assert.equal(body.includes("ORDER_ACCESS_SECRET"), false);
    assert.equal(body.includes("draftKey"), false);
    assert.equal(body.includes("asset-private"), false);
    assert.equal(body.includes("Café Studio Sur"), true);
    assert.match(body, /4\.900 ARS/, "the amount is shown");
    for (const name of ["studio-clasico-cafe.png", "studio-clasico-cafe.pdf", "studio-clasico-cafe.svg"]) {
      assert.equal(body.includes(name), true, name);
    }
  }
  assert.equal(mail.html.includes("/brand/atajolab-logo-email.png"), true);
  assert.equal(mail.html.includes('name="viewport"'), true);
  assert.equal(mail.html.includes("Descargar mis archivos"), true);
  assert.equal(mail.text.includes("vence en 7 días"), true);
  // Text is escaped in the HTML, never injected.
  const hostile = buildPurchaseEmail({
    origin,
    label: '<img src=x onerror=alert(1)>"',
    publicId,
    amountArs: 4900,
    currency: "ARS",
    paidAt: null,
    accessUrl: `${origin}/acceso/${"a".repeat(43)}`,
    files: [{ format: "png", filename: null, bytes: null }],
    attached: false,
    supportEmail: null,
  });
  assert.equal(hostile.html.includes("<img src=x"), false);
  assert.equal(hostile.html.includes("&lt;img src=x"), true);
  assert.equal(hostile.text.includes("Tus tres archivos están listos para descargar"), true);
}

{
  const sealed = sealAccessToken("a".repeat(43), secret);
  assert.equal(openAccessToken(sealed, secret), "a".repeat(43));
  assert.equal(openAccessToken(sealed, "other-secret-value-32-characters!!"), null);
  assert.equal(JSON.stringify(sealed.toString("base64")).includes("aaaaaaaa"), false);
  assert.ok(mailNotifyBackoffMs(1) >= 60_000);
  assert.equal(mailDispatchAuthorized("Bearer short", { MAIL_DISPATCH_SECRET: "x".repeat(16) }), false);
  assert.equal(
    mailDispatchAuthorized(`Bearer ${"s".repeat(16)}`, { MAIL_DISPATCH_SECRET: "s".repeat(16) }),
    true,
  );

  const prismaErr = Object.assign(new Error("Invalid `prisma.mailNotification.findMany()`"), {
    name: "PrismaClientKnownRequestError",
    code: "P2021",
  });
  const described = describeMailDispatchError(prismaErr);
  assert.equal(described.kind, "prisma");
  assert.equal(described.prismaCode, "P2021");
  assert.equal(described.detail?.includes("mailNotification"), true);

  const txErr = new Error("Transaction API error: Transaction not found.");
  assert.equal(describeMailDispatchError(txErr).kind, "transaction");

  const poolErr = new Error('ERROR: prepared statement "s1" already exists');
  assert.equal(describeMailDispatchError(poolErr).kind, "pooler");

  const leaked = describeMailDispatchError(
    new Error("fail postgresql://user:secret@host/db Bearer abc.def email me@example.com"),
  );
  assert.equal(leaked.detail?.includes("secret"), false);
  assert.equal(leaked.detail?.includes("me@example.com"), false);
  assert.equal(leaked.detail?.includes("Bearer ***"), true);
}

{
  const paid = memoryNotify(
    { status: "PAID", buyerEmail: buyer, artwork: v8Artwork("Lock-free dispatch") },
    [pendingRow()],
  );
  const outbox = sender("sent");
  const result = await runMailDispatchJob({
    now,
    originHref: origin,
    sender: outbox,
    store: paid.store,
    secret,
    orderId: publicId,
  });
  assert.equal("ok" in result && result.ok === false, false);
  assert.equal("sent" in result && result.sent === 1, true);

  const failingStore: PurchaseNotifyStore = {
    ...paid.store,
    async reclaimStale() {
      throw Object.assign(new Error("table missing"), {
        code: "P2021",
        name: "PrismaClientKnownRequestError",
      });
    },
  };
  const failed = await runMailDispatchJob({
    now,
    originHref: origin,
    sender: outbox,
    store: failingStore,
    secret,
  });
  assert.equal("ok" in failed && failed.ok === false, true);
  if ("ok" in failed && failed.ok === false) {
    assert.equal(failed.error, "dispatch-failed");
    assert.equal(failed.reason, "P2021");
  }
}

{
  const paid = memoryNotify(
    { status: "PAID", buyerEmail: buyer, artwork: v8Artwork("Diseño Corporativo A6") },
    [pendingRow()],
  );
  const outbox = sender("sent");
  const result = await dispatchPurchaseAccessMail({
    now,
    originHref: origin,
    sender: outbox,
    store: paid.store,
    secret,
    orderId: publicId,
  });
  assert.equal(result.sent, 1);
  assert.equal(outbox.messages.length, 1);
  assert.equal(outbox.messages[0]?.to, buyer);
  assert.equal(outbox.messages[0]?.text.includes("Diseño Corporativo A6"), true);
  assert.equal(outbox.messages[0]?.text.includes("asset-private-id-should-not-leak"), false);
  assert.equal(paid.notes.get("note-1")?.status, "SENT");
  assert.equal(paid.notes.get("note-1")?.accessTokenCipher, null);
  assert.equal(paid.links.size, 1);
  const token = outbox.messages[0]?.text.match(/\/acceso\/([A-Za-z0-9_-]{43})/)?.[1] ?? "";
  assert.equal(ACCESS_TOKEN_PATTERN.test(token), true);
  assert.equal(hashAccessToken(token), [...paid.links.values()][0]?.tokenHash);
}

{
  // Temporary Resend failure keeps the same access link for retry.
  const paid = memoryNotify(
    { status: "PAID", buyerEmail: buyer, artwork: v8Artwork("Studio") },
    [pendingRow()],
  );
  const flaky = sender("retryable");
  const first = await dispatchPurchaseAccessMail({
    now,
    originHref: origin,
    sender: flaky,
    store: paid.store,
    secret,
    orderId: publicId,
  });
  assert.equal(first.retryable, 1);
  assert.equal(paid.notes.get("note-1")?.status, "PENDING");
  assert.equal(paid.notes.get("note-1")?.lastError, "provider-temporary");
  assert.equal(paid.links.size, 1);
  const hash = [...paid.links.keys()][0];
  assert.ok(paid.notes.get("note-1")?.accessTokenHash === hash);

  const later = new Date(paid.notes.get("note-1")!.nextAttemptAt.getTime());
  const ok = sender("sent");
  const second = await dispatchPurchaseAccessMail({
    now: later,
    originHref: origin,
    sender: ok,
    store: paid.store,
    secret,
    orderId: publicId,
  });
  assert.equal(second.sent, 1);
  assert.equal(paid.links.size, 1);
  assert.equal([...paid.links.keys()][0], hash);
  assert.equal(ok.messages.length, 1);
  assert.equal(paid.notes.get("note-1")?.status, "SENT");
}

{
  const paid = memoryNotify(
    { status: "PAID", buyerEmail: buyer, artwork: v8Artwork("Studio") },
    [pendingRow()],
  );
  const permanent = sender("refused");
  permanent.canDispatch = true;
  const result = await dispatchPurchaseAccessMail({
    now,
    originHref: origin,
    sender: permanent,
    store: paid.store,
    secret,
    orderId: publicId,
  });
  assert.equal(result.failed, 1);
  assert.equal(paid.notes.get("note-1")?.status, "FAILED");
  assert.equal(paid.links.size, 0);
  assert.equal(paid.notes.get("note-1")?.accessTokenCipher, null);
}

{
  // Crash after PAID: row stays PENDING until a later job run.
  const paid = memoryNotify(
    { status: "PAID", buyerEmail: buyer, artwork: v8Artwork("Tras caída") },
    [pendingRow()],
  );
  assert.equal(paid.notes.get("note-1")?.status, "PENDING");
  const recovered = await dispatchPurchaseAccessMail({
    now,
    originHref: origin,
    sender: sender("held"),
    store: paid.store,
    secret,
    orderId: publicId,
  });
  assert.equal(recovered.held, 1);
  assert.equal(paid.notes.get("note-1")?.status, "SENT");
}

{
  // Two concurrent claims of the same due row: only one sends.
  const paid = memoryNotify(
    { status: "PAID", buyerEmail: buyer, artwork: v8Artwork("Concurrente") },
    [pendingRow()],
  );
  const outbox = sender("sent");
  const [a, b] = await Promise.all([
    dispatchPurchaseAccessMail({
      now,
      originHref: origin,
      sender: outbox,
      store: paid.store,
      secret,
      orderId: publicId,
    }),
    dispatchPurchaseAccessMail({
      now,
      originHref: origin,
      sender: outbox,
      store: paid.store,
      secret,
      orderId: publicId,
    }),
  ]);
  assert.equal(a.sent + b.sent, 1);
  assert.equal(a.skipped + b.skipped + a.sent + b.sent, 2);
  assert.equal(outbox.messages.length, 1);
  assert.equal(paid.notes.get("note-1")?.status, "SENT");
}

{
  // Job run twice after success: second pass is a no-op.
  const paid = memoryNotify(
    { status: "PAID", buyerEmail: buyer, artwork: v8Artwork("Idempotente") },
    [pendingRow()],
  );
  const outbox = sender("sent");
  const first = await dispatchPurchaseAccessMail({
    now,
    originHref: origin,
    sender: outbox,
    store: paid.store,
    secret,
    orderId: publicId,
  });
  const second = await dispatchPurchaseAccessMail({
    now,
    originHref: origin,
    sender: outbox,
    store: paid.store,
    secret,
    orderId: publicId,
  });
  assert.equal(first.sent, 1);
  assert.equal(second.claimed, 0);
  assert.equal(outbox.messages.length, 1);
}

{
  const pendingOrder = memoryNotify(
    { status: "PENDING", buyerEmail: buyer, artwork: v8Artwork("No") },
    [pendingRow()],
  );
  const outbox = sender("sent");
  const result = await dispatchPurchaseAccessMail({
    now,
    originHref: origin,
    sender: outbox,
    store: pendingOrder.store,
    secret,
    orderId: publicId,
  });
  assert.equal(result.failed, 1);
  assert.equal(outbox.messages.length, 0);
}

{
  const v7 = memoryNotify(
    { status: "PAID", buyerEmail: buyer, artwork: v7Artwork("Panadería Norte") },
    [pendingRow()],
  );
  const outbox = sender("held");
  await dispatchPurchaseAccessMail({
    now,
    originHref: origin,
    sender: outbox,
    store: v7.store,
    secret,
    orderId: publicId,
  });
  assert.equal(outbox.messages[0]?.text.includes("Panadería Norte"), true);
}

{
  const label = orderArtworkLabel(v8Artwork("Recuperación Studio V8"));
  const orders: RecoveryCandidate[] = [
    { publicId, status: "PAID", buyerEmail: buyer, label },
    {
      publicId: "dddddddddddddddddddddddd",
      status: "PENDING",
      buyerEmail: buyer,
      label: "Pendiente Studio",
    },
  ];
  assert.deepEqual(
    recoveryTargets(buyer, orders).map((row) => row.publicId),
    [publicId],
  );
  const box = memoryRecovery(orders);
  const outbox = sender();
  const response = await requestRecovery({
    email: buyer,
    now,
    origin,
    limited: false,
    store: box.store,
    sender: outbox,
  });
  assert.deepEqual(response, recoveryAcknowledgement());
  assert.equal(outbox.messages[0]?.text.includes("Recuperación Studio V8"), true);
  assert.ok(recoveryMail(origin, [{ label, token: "c".repeat(43) }]));
}

{
  const limiter = createRecoveryLimiter(() => now.getTime());
  for (let i = 0; i < 5; i += 1) assert.equal(limiter.allow("203.0.113.50"), true);
  assert.equal(limiter.allow("203.0.113.50"), false);
}

{
  assert.equal(
    studioCommercialFilename(v8Artwork("Café del Centro!"), "png"),
    "studio-corporativo-cafe-del-centro.png",
  );
  assert.equal(
    artworkFilename("tarjeta-resena", "Café del Centro", "pdf"),
    "tarjeta-resena-cafe-del-centro.pdf",
  );
}


// Purchase mail: HTML + text, the three files attached, fresh access link, sent once.
function fakeFiles(sizes = [200_000, 80_000, 30_000]): PurchaseFile[] {
  return [
    { format: "png", filename: "studio-clasico-cafe.png", content: Buffer.alloc(sizes[0]!, 1), contentType: "image/png" },
    { format: "pdf", filename: "studio-clasico-cafe.pdf", content: Buffer.alloc(sizes[1]!, 2), contentType: "application/pdf" },
    { format: "svg", filename: "studio-clasico-cafe.svg", content: Buffer.alloc(sizes[2]!, 3), contentType: "image/svg+xml" },
  ];
}

{
  const paid = memoryNotify(
    { status: "PAID", buyerEmail: buyer, artwork: v8Artwork("Café Studio Sur"), amountArs: 4900, currency: "ARS", paidAt: now },
    [pendingRow()],
  );
  const outbox = sender("sent");
  const result = await dispatchPurchaseAccessMail({
    now,
    originHref: origin,
    sender: outbox,
    store: paid.store,
    secret,
    orderId: publicId,
    loadFiles: async () => fakeFiles(),
  });
  assert.equal(result.sent, 1);
  const message = outbox.messages[0]!;
  assert.ok(message.html && message.html.includes("<html"), "html part");
  assert.ok(message.text.length > 0, "text alternative");
  assert.deepEqual(
    message.attachments?.map((file) => file.filename),
    ["studio-clasico-cafe.png", "studio-clasico-cafe.pdf", "studio-clasico-cafe.svg"],
  );
  assert.equal(message.text.includes("Adjuntamos a este correo"), true);
  // The link lives for the purchase window, not 30 minutes.
  const expires = [...paid.links.values()][0]!.expiresAt.getTime();
  assert.equal(expires - now.getTime(), 7 * 24 * 60 * 60 * 1000);

  // A second dispatch for the same order sends nothing: the notification is already SENT.
  const again = await dispatchPurchaseAccessMail({
    now: new Date(now.getTime() + 60_000),
    originHref: origin,
    sender: outbox,
    store: paid.store,
    secret,
    orderId: publicId,
    loadFiles: async () => fakeFiles(),
  });
  assert.equal(again.claimed, 0);
  assert.equal(outbox.calls, 1, "no duplicate mail");

  // Controlled resend: back in the queue, a new mail with a fresh link, nobody is charged.
  assert.equal(await resendPurchaseMail(publicId, { now, store: paid.store }), "requeued");
  assert.equal(await resendPurchaseMail(publicId, { now, store: paid.store }), "busy", "already queued");
  const resent = await dispatchPurchaseAccessMail({
    now,
    originHref: origin,
    sender: outbox,
    store: paid.store,
    secret,
    orderId: publicId,
    loadFiles: async () => fakeFiles(),
  });
  assert.equal(resent.sent, 1);
  assert.equal(outbox.calls, 2);
}

{
  // Only PAID orders can be resent.
  const unpaid = memoryNotify({ status: "PENDING", buyerEmail: buyer, artwork: v8Artwork("x") }, [pendingRow()]);
  assert.equal(await resendPurchaseMail(publicId, { now, store: unpaid.store }), "not-payable");
}

{
  // Files too big for one mail: the message still goes out, with the download button only.
  const paid = memoryNotify({ status: "PAID", buyerEmail: buyer, artwork: v8Artwork("Grande") }, [pendingRow()]);
  const outbox = sender("sent");
  const result = await dispatchPurchaseAccessMail({
    now,
    originHref: origin,
    sender: outbox,
    store: paid.store,
    secret,
    orderId: publicId,
    loadFiles: async () => fakeFiles([9 * 1024 * 1024, 5 * 1024 * 1024, 3 * 1024 * 1024]),
  });
  assert.equal(result.sent, 1);
  assert.equal(outbox.messages[0]?.attachments, undefined);
  assert.equal(outbox.messages[0]?.text.includes("/acceso/"), true);
  assert.equal(outbox.messages[0]?.text.includes("Tus tres archivos están listos para descargar"), true);
}

{
  // The provider refuses the message with attachments: send once more without them.
  const paid = memoryNotify({ status: "PAID", buyerEmail: buyer, artwork: v8Artwork("Rechazo") }, [pendingRow()]);
  let calls = 0;
  const outbox = sender(() => (++calls === 1 ? "refused" : "sent"));
  const result = await dispatchPurchaseAccessMail({
    now,
    originHref: origin,
    sender: outbox,
    store: paid.store,
    secret,
    orderId: publicId,
    loadFiles: async () => fakeFiles(),
  });
  assert.equal(result.sent, 1);
  assert.equal(outbox.messages.length, 2);
  assert.ok(outbox.messages[0]?.attachments);
  assert.equal(outbox.messages[1]?.attachments, undefined);
  assert.equal(paid.notes.get("note-1")?.status, "SENT");
}

{
  // Rendering fails: no mail yet, the notification is retried, the order is untouched, later claims fall back.
  const paid = memoryNotify({ status: "PAID", buyerEmail: buyer, artwork: v8Artwork("Falla") }, [pendingRow()]);
  const outbox = sender("sent");
  let moment = now;
  const failing = async (): Promise<PurchaseFile[]> => {
    throw new Error("render exploded");
  };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await dispatchPurchaseAccessMail({
      now: moment,
      originHref: origin,
      sender: outbox,
      store: paid.store,
      secret,
      orderId: publicId,
      loadFiles: failing,
    });
    assert.equal(result.retryable, 1, "attempt " + attempt);
    assert.equal(paid.notes.get("note-1")?.status, "PENDING");
    assert.equal(paid.notes.get("note-1")?.lastError, "files-render");
    moment = new Date(moment.getTime() + 25 * 60 * 60 * 1000);
  }
  assert.equal(outbox.calls, 0);
  const last = await dispatchPurchaseAccessMail({
    now: moment,
    originHref: origin,
    sender: outbox,
    store: paid.store,
    secret,
    orderId: publicId,
    loadFiles: failing,
  });
  assert.equal(last.sent, 1, "after repeated failures the mail goes out with the button");
  assert.equal(outbox.messages[0]?.attachments, undefined);
}

console.log("purchase notify checks passed");
