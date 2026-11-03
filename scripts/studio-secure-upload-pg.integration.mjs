/**
 * Local Postgres integration for Studio secure upload + order prep.
 * Refuses non-local DATABASE_URL. Deletes fixtures at the end.
 */
import assert from "node:assert/strict";
import sharp from "sharp";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost)(:\d+)?\//i.test(databaseUrl)) {
  throw new Error("studio-secure-upload-pg.integration refuses non-local DATABASE_URL");
}

const { prisma } = await import("../lib/db.ts");
const { parseOrderDraft } = await import("../lib/order-draft.ts");
const { savePendingOrder } = await import("../lib/orders.ts");
const {
  createPrismaStudioAssetStore,
  createStudioDraftKey,
  dehydrateStudioDocument,
  hashStudioDraftKey,
  putStudioAssetForDraft,
} = await import("../lib/studio/assets/index.ts");
const { runStudioAssetCleanup } = await import("../lib/studio/assets/cleanup-job.ts");
const { updateElement } = await import("../lib/studio/document.ts");
const { createDocument } = await import("../lib/studio/templates.ts");
const { createStudioOrderIdempotencyKey } = await import("../lib/studio/order-idempotency.ts");
const { createPostgresRateLimiter } = await import("../lib/rate-limit/postgres.ts");

const store = createPrismaStudioAssetStore(prisma);
const draftKey = createStudioDraftKey();
const draftHash = hashStudioDraftKey(draftKey);
const otherKey = createStudioDraftKey();
const otherHash = hashStudioDraftKey(otherKey);
const REVIEW_URL = "https://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnop";
const createdOrderIds = [];
const createdAssetIds = [];
const rateKeys = [];

async function pngBytes(seed = 20) {
  return sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: seed, g: 90, b: 80 } },
  })
    .png()
    .toBuffer();
}

function withQr(document, value) {
  const qr = document.elements.find((element) => element.type === "qr");
  assert.ok(qr);
  return updateElement(document, qr.id, { value });
}

function withImage(document, id, src) {
  return {
    ...document,
    elements: [
      ...document.elements.filter((element) => element.type !== "image"),
      {
        id,
        role: null,
        type: "image",
        x: 12,
        y: 40,
        width: 28,
        height: 28,
        rotation: 0,
        src,
        alt: "logo",
      },
    ],
  };
}

try {
  const table = await prisma.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'RateLimitBucket'
  `);
  assert.ok(table.some((row) => row.column_name === "bucketKey" || row.column_name === "bucketkey"));

  const limiter = createPostgresRateLimiter(prisma);
  const bucket = `studio:test:${Date.now()}`;
  rateKeys.push(bucket);
  assert.equal((await limiter.consume(bucket, 2, 60_000)).ok, true);
  assert.equal((await limiter.consume(bucket, 2, 60_000)).ok, true);
  assert.equal((await limiter.consume(bucket, 2, 60_000)).ok, false);

  const bytes = await pngBytes();
  const put = await putStudioAssetForDraft({ store, draftKeyHash: draftHash, bytes });
  assert.equal(put.ok, true);
  createdAssetIds.push(put.asset.id);

  const foreign = await putStudioAssetForDraft({
    store,
    draftKeyHash: otherHash,
    bytes: await pngBytes(90),
  });
  assert.equal(foreign.ok, true);
  createdAssetIds.push(foreign.asset.id);

  let document = withQr(createDocument("corporativo"), REVIEW_URL);
  document = withImage(document, "logo", `data:image/png;base64,${bytes.toString("base64")}`);
  const dehydrated = await dehydrateStudioDocument({
    document,
    store,
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
      email: "studio-secure-upload@example.com",
      document: dehydrated.document,
    },
    { studioDraftKey: draftKey },
  );
  assert.equal(parsed.ok, true);
  const created = await savePendingOrder(parsed.draft);
  createdOrderIds.push(created.publicId);

  const retained = await prisma.studioAsset.findMany({ where: { orderId: created.publicId } });
  assert.ok(retained.length >= 1);
  for (const row of retained) {
    assert.equal(row.status, "RETAINED");
    assert.equal(row.draftKeyHash, draftHash);
  }

  // Foreign draft cannot retain the same assets.
  const stolen = parseOrderDraft(
    {
      version: 8,
      idempotencyKey: createStudioOrderIdempotencyKey(),
      email: "studio-secure-upload@example.com",
      document: withImage(
        withQr(createDocument("creativo"), REVIEW_URL),
        "stolen",
        `asset:${foreign.asset.id}`,
      ),
    },
    { studioDraftKey: draftKey },
  );
  assert.equal(stolen.ok, true);
  await assert.rejects(() => savePendingOrder(stolen.draft), /order-assets/);

  // Expiration + cleanup
  await prisma.studioAsset.updateMany({
    where: { id: foreign.asset.id },
    data: { expiresAt: new Date(Date.now() - 60_000), status: "TEMPORARY", orderId: null },
  });
  const cleanup = await runStudioAssetCleanup(new Date());
  assert.equal(cleanup.ok, true);
  assert.equal(await prisma.studioAsset.findUnique({ where: { id: foreign.asset.id } }), null);
  assert.ok(await prisma.studioAsset.findFirst({ where: { orderId: created.publicId } }));

  console.log("studio-secure-upload-pg.integration ok", {
    publicId: created.publicId,
    assets: retained.length,
  });
} finally {
  if (createdOrderIds.length > 0) {
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  await prisma.studioAsset.deleteMany({
    where: { OR: [{ id: { in: createdAssetIds } }, { draftKeyHash: { in: [draftHash, otherHash] } }] },
  });
  if (rateKeys.length > 0) {
    await prisma.rateLimitBucket.deleteMany({ where: { bucketKey: { in: rateKeys } } });
  }
  await prisma.$disconnect();
}
