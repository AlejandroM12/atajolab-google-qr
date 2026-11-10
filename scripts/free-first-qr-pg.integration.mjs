/**
 * Real Postgres integration for "Tu primer QR es gratis".
 * Free order + same files as a purchase, second attempt, idempotent retry and
 * concurrent requests. Creates isolated rows and deletes them at the end.
 *
 * Run:
 *   node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-test.mjs scripts/free-first-qr-pg.integration.mjs
 *
 * Refuses non-local DATABASE_URL (no Neon/production).
 */
import assert from "node:assert/strict";
import sharp from "sharp";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost)(:\d+)?\//i.test(databaseUrl)) {
  throw new Error("free-first-qr-pg.integration refuses non-local DATABASE_URL");
}

const { prisma } = await import("../lib/db.ts");
const { parseOrderDraft } = await import("../lib/order-draft.ts");
const { findDownloadOrder, findOrder, savePendingOrder, visitorFreeClaimUsed } = await import("../lib/orders.ts");
const { PIECE_PRICE_ARS } = await import("../lib/pricing.ts");
const { buildOrderDownloadAttachment } = await import("../lib/print/download.ts");
const { decidePayment } = await import("../lib/payments/decision.ts");
const { createVisitorKey, hashFreeEmail, hashVisitorKey } = await import("../lib/free-first-qr.ts");
const { createStudioDraftKey, dehydrateStudioDocument, createPrismaStudioAssetStore } = await import(
  "../lib/studio/assets/index.ts"
);
const { hashStudioDraftKey } = await import("../lib/studio/assets/draft-key.ts");
const { updateElement } = await import("../lib/studio/document.ts");
const { createDocument } = await import("../lib/studio/templates.ts");
const { createStudioOrderIdempotencyKey } = await import("../lib/studio/order-idempotency.ts");

const REVIEW_URL = "https://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnop";
const store = createPrismaStudioAssetStore(prisma);
const run = Date.now().toString(36);
const createdOrderIds = [];
const draftHashes = [];
const logoBytes = await sharp({
  create: { width: 96, height: 72, channels: 3, background: { r: 20, g: 90, b: 80 } },
})
  .png()
  .toBuffer();

function claim(visitorKey, email) {
  return { visitorKeyHash: hashVisitorKey(visitorKey), emailHash: hashFreeEmail(email) };
}

async function draftFor(
  email,
  draftKey = createStudioDraftKey(),
  idempotencyKey = createStudioOrderIdempotencyKey(),
  template = "corporativo",
) {
  const base = createDocument(template);
  const qr = base.elements.find((element) => element.type === "qr");
  const withQr = updateElement(base, qr.id, { value: REVIEW_URL });
  const document = template !== "corporativo" ? withQr : {
    ...withQr,
    elements: [
      ...withQr.elements.filter((element) => element.type !== "image"),
      {
        id: "logo",
        role: null,
        type: "image",
        x: 12,
        y: 40,
        width: 28,
        height: 28,
        rotation: 0,
        src: `data:image/png;base64,${logoBytes.toString("base64")}`,
        alt: "logo",
      },
    ],
  };
  const draftKeyHash = hashStudioDraftKey(draftKey);
  if (!draftHashes.includes(draftKeyHash)) draftHashes.push(draftKeyHash);
  const dehydrated = await dehydrateStudioDocument({ document, store, draftKeyHash });
  assert.equal(dehydrated.ok, true);
  const parsed = parseOrderDraft(
    { version: 8, idempotencyKey, email, document: dehydrated.document },
    { studioDraftKey: draftKey },
  );
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  return parsed.draft;
}

async function save(draft, options) {
  const created = await savePendingOrder(draft, options);
  createdOrderIds.push(created.publicId);
  return created;
}

try {
  // 1. First free order: FREE, amount 0, no Mercado Pago data, claim recorded.
  const visitorA = createVisitorKey();
  const emailA = `free-a-${run}@example.com`;
  const draftKeyA = createStudioDraftKey();
  const idempotencyA = createStudioOrderIdempotencyKey();
  // "clasico" is the editor default; orders from every template must stay readable.
  const draftA = await draftFor(emailA, draftKeyA, idempotencyA, "clasico");
  const first = await save(draftA, { free: claim(visitorA, emailA), allowPaid: false });
  assert.equal(first.status, "FREE");

  const stored = await findOrder(first.publicId);
  assert.ok(stored, "free order from the clasico template is readable");
  assert.equal(stored.status, "FREE");
  const row = await prisma.order.findUnique({ where: { id: first.publicId } });
  assert.equal(row.status, "FREE");
  assert.equal(row.amountArs, 0);
  assert.equal(row.mercadoPagoPaymentId, null);
  assert.equal(row.mercadoPagoPaymentStatus, null);
  assert.equal(row.mercadoPagoPreferenceId, null);
  assert.equal(row.paidAt, null);
  const claimRow = await prisma.freeQrClaim.findUnique({ where: { orderId: first.publicId } });
  assert.ok(claimRow);
  assert.equal(JSON.stringify(claimRow).includes(emailA), false, "claim stores hashes only");
  assert.equal(await visitorFreeClaimUsed(hashVisitorKey(visitorA)), true);

  // 2. Same files as a purchase: authorized download with the order cookie, no watermark path.
  const downloadOrder = await findDownloadOrder(first.publicId);
  for (const format of ["png", "svg", "pdf"]) {
    const file = await buildOrderDownloadAttachment({
      publicId: first.publicId,
      format,
      deliveryKey: first.deliveryKey,
      order: downloadOrder,
    });
    assert.equal(file.ok, true, `free ${format} download`);
    assert.ok(file.body.length > 100);
  }
  const pdf = await buildOrderDownloadAttachment({
    publicId: first.publicId,
    format: "pdf",
    deliveryKey: first.deliveryKey,
    order: downloadOrder,
  });
  assert.equal(pdf.body.subarray(0, 5).toString("latin1"), "%PDF-");
  // Without the order cookie nobody else can download it.
  const stranger = await buildOrderDownloadAttachment({
    publicId: first.publicId,
    format: "png",
    deliveryKey: null,
    order: downloadOrder,
  });
  assert.equal(stranger.ok, false);

  // 3. Retry of the same request (lost response) returns the same FREE order, even with sales closed.
  const replay = await savePendingOrder(draftA, {
    free: null,
    allowPaid: false,
  });
  assert.equal(replay.publicId, first.publicId);
  assert.equal(replay.status, "FREE");
  assert.equal(replay.deliveryKey, first.deliveryKey);

  // 4. Second attempt from the same browser: never free again.
  const secondEmail = `free-a2-${run}@example.com`;
  await assert.rejects(
    async () => save(await draftFor(secondEmail), { free: claim(visitorA, secondEmail), allowPaid: false }),
    /free-unavailable/,
  );
  const paidFallback = await save(await draftFor(secondEmail), { free: claim(visitorA, secondEmail), allowPaid: true });
  assert.equal(paidFallback.status, "PENDING");
  const paidRow = await findOrder(paidFallback.publicId);
  assert.equal(paidRow.status, "PENDING");
  assert.equal(paidRow.amountArs, PIECE_PRICE_ARS);

  // 5. Same inbox from another browser (alias with +tag): not free.
  const aliasEmail = emailA.replace("@", `+otra@`);
  await assert.rejects(
    async () => save(await draftFor(aliasEmail), { free: claim(createVisitorKey(), aliasEmail), allowPaid: false }),
    /free-unavailable/,
  );

  // 6. Mercado Pago can never mark or touch a FREE order.
  const decision = decidePayment(
    { publicId: first.publicId, status: "FREE", amountArs: 0, currency: "ARS", paymentId: null },
    {
      id: "123",
      status: "approved",
      amount: PIECE_PRICE_ARS,
      currency: "ARS",
      externalReference: first.publicId,
      liveMode: false,
      approvedAt: new Date().toISOString(),
      parties: "verified-test-users",
      collectorId: null,
      accountId: null,
    },
    new Date(),
    "test",
  );
  assert.equal(decision.action, "ignore");

  // 7. Concurrent requests from one browser with sales closed: exactly one FREE order.
  const visitorB = createVisitorKey();
  const burst = await Promise.allSettled(
    Array.from({ length: 8 }, async (_, index) => {
      const email = `free-b${index}-${run}@example.com`;
      return save(await draftFor(email), { free: claim(visitorB, email), allowPaid: false });
    }),
  );
  const freeWins = burst.filter((result) => result.status === "fulfilled" && result.value.status === "FREE");
  const refused = burst.filter((result) => result.status === "rejected");
  assert.equal(freeWins.length, 1, "one free order per browser under concurrency");
  assert.equal(refused.length, 7);
  for (const result of refused) assert.match(String(result.reason?.message), /free-unavailable/);
  assert.equal(await prisma.freeQrClaim.count({ where: { visitorKeyHash: hashVisitorKey(visitorB) } }), 1);

  // 8. Concurrent requests with sales open: one FREE, the rest are normal paid orders.
  const visitorC = createVisitorKey();
  const mixed = await Promise.all(
    Array.from({ length: 6 }, async (_, index) => {
      const email = `free-c${index}-${run}@example.com`;
      return save(await draftFor(email), { free: claim(visitorC, email), allowPaid: true });
    }),
  );
  assert.equal(mixed.filter((order) => order.status === "FREE").length, 1);
  assert.equal(mixed.filter((order) => order.status === "PENDING").length, 5);

  console.log("free-first-qr-pg.integration ok", { free: first.publicId, concurrent: burst.length + mixed.length });
} finally {
  if (createdOrderIds.length > 0) {
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (draftHashes.length > 0) {
    await prisma.studioAsset.deleteMany({ where: { draftKeyHash: { in: draftHashes } } });
  }
  await prisma.$disconnect();
}
