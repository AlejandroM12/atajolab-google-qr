/**
 * Local Postgres + Resend mock (dev outbox): Studio v8 order → PAID mail → recovery → downloads.
 * Refuses non-local DATABASE_URL. Deletes fixtures at the end. No real email or Mercado Pago.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost)(:\d+)?\//i.test(databaseUrl)) {
  throw new Error("studio-delivery-email-v8-pg.integration refuses non-local DATABASE_URL");
}

process.env.NODE_ENV = "development";
process.env.APP_URL = process.env.APP_URL?.trim() || "http://localhost:3001";
process.env.EMAIL_PROVIDER = "";
process.env.MERCADOPAGO_ENV = "test";
if (!process.env.ORDER_ACCESS_SECRET || process.env.ORDER_ACCESS_SECRET.length < 32) {
  process.env.ORDER_ACCESS_SECRET = "local-delivery-email-v8-test-secret-32b";
}

const mailDir = await mkdtemp(path.join(tmpdir(), "atajolab-delivery-mail-"));
const outboxPath = path.join(mailDir, "mail-outbox.jsonl");

const { prisma } = await import("../lib/db.ts");
const { parseOrderDraft } = await import("../lib/order-draft.ts");
const {
  applyVerifiedPayment,
  findOrder,
  findOrderAccessHashes,
  findPaymentRecord,
  findRecoveryCandidates,
  redeemDownloadAccess,
  savePendingOrder,
} = await import("../lib/orders.ts");
const { createDevOutbox } = await import("../lib/mail.ts");
const { orderArtworkLabel } = await import("../lib/order-label.ts");
const { dispatchPurchaseAccessMail } = await import("../lib/purchase-notify.ts");
const {
  buildOrderDownloadAttachment,
  studioCommercialFilename,
} = await import("../lib/print/download.ts");
const {
  countActiveAccessLinks,
  revokeAccessLinks,
  saveAccessLink,
} = await import("../lib/orders.ts");
const { requestRecovery } = await import("../lib/recovery.ts");
const { PIECE_PRICE_ARS } = await import("../lib/pricing.ts");
const { createPrismaStudioAssetStore, createStudioDraftKey, dehydrateStudioDocument, hashStudioDraftKey, putStudioAssetForDraft } =
  await import("../lib/studio/assets/index.ts");
const { updateElement } = await import("../lib/studio/document.ts");
const { createDocument } = await import("../lib/studio/templates.ts");
const { createStudioOrderIdempotencyKey } = await import("../lib/studio/order-idempotency.ts");
const { STUDIO_COMMERCIAL_ARTWORK_VERSION } = await import("../lib/studio/commercial-artwork.ts");

const REVIEW_URL = "https://search.google.com/local/writereview?placeid=ChIJdeliveryemailv8";
const BUYER = "studio-delivery-v8@example.com";
const ORIGIN = "http://localhost:3001";

const assetStore = createPrismaStudioAssetStore(prisma);
const draftKey = createStudioDraftKey();
const draftHash = hashStudioDraftKey(draftKey);
const createdOrderIds = [];
const createdAssetIds = [];
const mailSender = createDevOutbox(mailDir);

function withQr(document, value) {
  const qr = document.elements.find((element) => element.type === "qr");
  assert.ok(qr);
  return updateElement(document, qr.id, { value });
}

async function pngBytes() {
  return sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: 30, g: 110, b: 90 } },
  })
    .png()
    .toBuffer();
}

async function readOutbox() {
  try {
    const raw = await readFile(outboxPath, "utf8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

try {
  const bytes = await pngBytes();
  const put = await putStudioAssetForDraft({ store: assetStore, draftKeyHash: draftHash, bytes });
  assert.equal(put.ok, true);
  createdAssetIds.push(put.asset.id);

  let document = withQr(createDocument("corporativo"), REVIEW_URL);
  const titleEl = document.elements.find((el) => el.type === "text" && el.role === "titulo");
  if (titleEl) {
    document = updateElement(document, titleEl.id, { text: "Entrega Studio V8" });
  }
  document = {
    ...document,
    elements: [
      ...document.elements.filter((element) => element.type !== "image"),
      {
        id: "logo",
        role: null,
        type: "image",
        x: 12,
        y: 40,
        width: 28,
        height: 28,
        rotation: 0,
        src: `data:image/png;base64,${bytes.toString("base64")}`,
        alt: "logo",
      },
    ],
  };

  const dehydrated = await dehydrateStudioDocument({
    document,
    store: assetStore,
    draftKeyHash: draftHash,
  });
  assert.equal(dehydrated.ok, true);
  for (const id of dehydrated.assetIds) {
    if (!createdAssetIds.includes(id)) createdAssetIds.push(id);
  }

  const parsed = parseOrderDraft(
    {
      version: 8,
      idempotencyKey: createStudioOrderIdempotencyKey(),
      email: BUYER,
      document: dehydrated.document,
    },
    { studioDraftKey: draftKey },
  );
  assert.equal(parsed.ok, true);

  const created = await savePendingOrder(parsed.draft);
  createdOrderIds.push(created.publicId);
  const originalDeliveryKey = created.deliveryKey;

  const pending = await findOrder(created.publicId);
  assert.equal(pending?.status, "PENDING");
  assert.equal(pending?.amountArs, PIECE_PRICE_ARS);
  assert.equal(pending?.artwork.version, STUDIO_COMMERCIAL_ARTWORK_VERSION);
  const designLabel = orderArtworkLabel(pending.artwork);
  assert.equal(designLabel.includes("Entrega Studio V8") || designLabel.length > 0, true);

  // PENDING has no outbox row yet.
  const pendingDispatch = await dispatchPurchaseAccessMail({
    originHref: ORIGIN,
    sender: mailSender,
    orderId: created.publicId,
    limit: 1,
  });
  assert.equal(pendingDispatch.claimed, 0);
  assert.equal((await readOutbox()).length, 0);

  const checkedAt = new Date();
  const verifiedPayment = {
    id: "delivery-mail-9001",
    status: "approved",
    amount: PIECE_PRICE_ARS,
    currency: "ARS",
    externalReference: created.publicId,
    liveMode: false,
    approvedAt: checkedAt.toISOString(),
    parties: "verified-test-users",
    collectorId: null,
    accountId: null,
  };
  // Simulate process crash after PAID+enqueue: skip immediate dispatch.
  await applyVerifiedPayment(created.publicId, verifiedPayment, checkedAt, {
    dispatch: async () => undefined,
  });

  const paid = await findOrder(created.publicId);
  assert.equal(paid?.status, "PAID");
  const pendingMail = await prisma.mailNotification.findUnique({
    where: { orderId_kind: { orderId: created.publicId, kind: "PURCHASE_ACCESS" } },
  });
  assert.equal(pendingMail?.status, "PENDING");
  assert.equal((await readOutbox()).length, 0);

  // Job recovers the pending notification.
  const recoveredDispatch = await dispatchPurchaseAccessMail({
    orderId: created.publicId,
    originHref: ORIGIN,
    sender: mailSender,
    limit: 1,
  });
  assert.equal(recoveredDispatch.held + recoveredDispatch.sent, 1);

  const notification = await prisma.mailNotification.findUnique({
    where: { orderId_kind: { orderId: created.publicId, kind: "PURCHASE_ACCESS" } },
  });
  assert.equal(notification?.status, "SENT");
  assert.equal(notification?.accessTokenCipher, null);

  const messages = await readOutbox();
  assert.equal(messages.length, 1);
  const purchase = messages.find((row) => row.to === BUYER && String(row.subject).includes("compra"));
  assert.ok(purchase);
  assert.equal(String(purchase.text).includes(designLabel), true);
  assert.equal(String(purchase.text).includes(created.publicId), true);
  // HTML part, plus the three rendered files from the stored order (real exporters, real asset store).
  assert.equal(String(purchase.html).includes("Descargar mis archivos"), true);
  assert.equal(String(purchase.html).includes(put.asset.id), false);
  assert.deepEqual(
    purchase.attachments.map((file) => file.filename.split(".").pop()),
    ["png", "pdf", "svg"],
  );
  for (const file of purchase.attachments) {
    assert.equal(file.bytes > 1000, true, file.filename);
    const body = await readFile(path.join(mailDir, file.file));
    if (file.filename.endsWith(".png")) assert.equal(body.subarray(1, 4).toString("latin1"), "PNG");
    if (file.filename.endsWith(".pdf")) assert.equal(body.subarray(0, 5).toString("latin1"), "%PDF-");
    if (file.filename.endsWith(".svg")) assert.equal(body.toString("utf8").includes("<svg"), true);
  }
  assert.equal(String(purchase.text).includes(put.asset.id), false);
  assert.equal(String(purchase.text).includes("draftKey"), false);
  assert.equal(String(purchase.text).includes(originalDeliveryKey), false);

  const purchaseToken = String(purchase.text).match(/\/acceso\/([A-Za-z0-9_-]{43})/)?.[1] ?? "";
  assert.equal(purchaseToken.length, 43);

  // Duplicate PAID apply must not enqueue or mail again.
  const beforeDup = (await readOutbox()).length;
  const activeBeforeDup = await countActiveAccessLinks(created.publicId, new Date());
  await applyVerifiedPayment(created.publicId, verifiedPayment, new Date(), {
    dispatch: (id) =>
      dispatchPurchaseAccessMail({
        orderId: id,
        originHref: ORIGIN,
        sender: mailSender,
        limit: 1,
      }),
  });
  assert.equal((await readOutbox()).length, beforeDup);
  assert.equal(await countActiveAccessLinks(created.publicId, new Date()), activeBeforeDup);
  assert.equal(
    await prisma.mailNotification.count({
      where: { orderId: created.publicId, kind: "PURCHASE_ACCESS" },
    }),
    1,
  );

  // Job twice after SENT is a no-op.
  const secondJob = await dispatchPurchaseAccessMail({
    orderId: created.publicId,
    originHref: ORIGIN,
    sender: mailSender,
    limit: 1,
  });
  assert.equal(secondJob.claimed, 0);
  assert.equal((await readOutbox()).length, beforeDup);

  // Recovery without the original checkout cookie.
  const beforeRecovery = (await readOutbox()).length;
  const recovered = await requestRecovery({
    email: BUYER,
    now: new Date(),
    origin: ORIGIN,
    limited: false,
    store: {
      findOrders: findRecoveryCandidates,
      countActiveLinks: countActiveAccessLinks,
      saveLink: saveAccessLink,
      revoke: revokeAccessLinks,
    },
    sender: mailSender,
  });
  assert.deepEqual(recovered, { status: "accepted" });
  const afterRecovery = await readOutbox();
  assert.equal(afterRecovery.length, beforeRecovery + 1);
  const recoveryMail = afterRecovery[afterRecovery.length - 1];
  assert.equal(recoveryMail.to, BUYER);
  assert.equal(String(recoveryMail.text).includes(designLabel), true);
  const recoveryToken = String(recoveryMail.text).match(/\/acceso\/([A-Za-z0-9_-]{43})/)?.[1] ?? "";
  assert.equal(recoveryToken.length, 43);
  assert.notEqual(recoveryToken, purchaseToken);

  const unknown = await requestRecovery({
    email: "nadie-delivery-v8@example.com",
    now: new Date(),
    origin: ORIGIN,
    limited: false,
    store: {
      findOrders: findRecoveryCandidates,
      countActiveLinks: countActiveAccessLinks,
      saveLink: saveAccessLink,
      revoke: revokeAccessLinks,
    },
    sender: mailSender,
  });
  assert.deepEqual(unknown, { status: "accepted" });
  assert.equal((await readOutbox()).length, afterRecovery.length);

  const redeemed = await redeemDownloadAccess(recoveryToken, new Date());
  assert.equal(redeemed.ok, true);
  if (!redeemed.ok) throw new Error("redeem");
  assert.equal(redeemed.publicId, created.publicId);
  assert.notEqual(redeemed.deliveryKey, originalDeliveryKey);

  const paymentRow = await findPaymentRecord(created.publicId);
  const accessHashes = await findOrderAccessHashes(created.publicId);
  assert.ok(accessHashes.length >= 2);

  for (const format of ["png", "svg", "pdf"]) {
    const file = await buildOrderDownloadAttachment({
      publicId: created.publicId,
      format,
      deliveryKey: redeemed.deliveryKey,
      order: {
        publicId: created.publicId,
        status: "PAID",
        artwork: paid.artwork,
        deliveryKeyHash: paymentRow.deliveryKeyHash,
        accessKeyHashes: accessHashes,
      },
      store: assetStore,
    });
    assert.equal(file.ok, true);
    if (!file.ok) throw new Error(format);
    const expectedName = studioCommercialFilename(paid.artwork, format);
    assert.equal(file.headers["content-disposition"]?.includes(expectedName.split(".")[0]), true);
    assert.equal(file.headers["cache-control"], "private, no-store");
    if (format === "png") assert.equal(file.headers["content-type"], "image/png");
    if (format === "svg") assert.equal(file.headers["content-type"], "image/svg+xml");
    if (format === "pdf") {
      assert.equal(file.headers["content-type"], "application/pdf");
      assert.equal(file.body.subarray(0, 5).toString("utf8"), "%PDF-");
    }
  }

  // publicId alone is not enough.
  const denied = await buildOrderDownloadAttachment({
    publicId: created.publicId,
    format: "png",
    deliveryKey: null,
    order: {
      publicId: created.publicId,
      status: "PAID",
      artwork: paid.artwork,
      deliveryKeyHash: paymentRow.deliveryKeyHash,
      accessKeyHashes: accessHashes,
    },
    store: assetStore,
  });
  assert.deepEqual(denied, { ok: false, status: 403, error: "download-unavailable" });

  console.log("studio-delivery-email-v8-pg.integration ok", {
    publicId: created.publicId,
    label: designLabel,
    purchaseMails: messages.filter((row) => String(row.subject).includes("compra")).length,
  });
} finally {
  if (createdOrderIds.length > 0) {
    await prisma.mailNotification.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await prisma.downloadAccessLink.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await prisma.downloadAccessCredential.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await prisma.studioOrderAttempt.deleteMany({ where: { orderId: { in: createdOrderIds } } }).catch(() => {});
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  await prisma.studioAsset.deleteMany({
    where: { OR: [{ id: { in: createdAssetIds } }, { draftKeyHash: draftHash }] },
  });
  await prisma.$disconnect();
  await rm(mailDir, { recursive: true, force: true });
}
