/**
 * Real Postgres integration for Studio v8 commercial orders.
 * Creates isolated rows, verifies PENDING + retained assets + rollback, then deletes them.
 *
 * Run:
 *   node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-test.mjs scripts/studio-orders-pg.integration.mjs
 *
 * Refuses non-local DATABASE_URL (no Neon/production).
 */
import assert from "node:assert/strict";
import sharp from "sharp";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost)(:\d+)?\//i.test(databaseUrl)) {
  throw new Error("studio-orders-pg.integration refuses non-local DATABASE_URL");
}

const { prisma } = await import("../lib/db.ts");
const { parseOrderDraft, readArtworkSnapshot } = await import("../lib/order-draft.ts");
const { findOrder, savePendingOrder } = await import("../lib/orders.ts");
const { PIECE_PRICE_ARS } = await import("../lib/pricing.ts");
const {
  createPrismaStudioAssetStore,
  createStudioDraftKey,
  dehydrateStudioDocument,
  documentHasDataUrls,
  hashStudioDraftKey,
  putStudioAssetForDraft,
} = await import("../lib/studio/assets/index.ts");
const { updateElement } = await import("../lib/studio/document.ts");
const { createDocument } = await import("../lib/studio/templates.ts");
const { createStudioOrderIdempotencyKey } = await import("../lib/studio/order-idempotency.ts");

const store = createPrismaStudioAssetStore(prisma);
const draftKey = createStudioDraftKey();
const draftHash = hashStudioDraftKey(draftKey);
const otherKey = createStudioDraftKey();
const otherHash = hashStudioDraftKey(otherKey);
const REVIEW_URL = "https://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnop";

const createdOrderIds = [];
const createdAssetIds = [];

async function pngBytes() {
  return sharp({
    create: { width: 96, height: 72, channels: 3, background: { r: 20, g: 90, b: 80 } },
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
  const beforeOrders = await prisma.order.count();
  const beforeAssets = await prisma.studioAsset.count();

  const bytes = await pngBytes();
  const put = await putStudioAssetForDraft({ store, draftKeyHash: draftHash, bytes });
  assert.equal(put.ok, true);
  createdAssetIds.push(put.asset.id);

  const foreign = await putStudioAssetForDraft({ store, draftKeyHash: otherHash, bytes });
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
  assert.equal(documentHasDataUrls(dehydrated.document), false);
  for (const id of dehydrated.assetIds) {
    if (!createdAssetIds.includes(id)) createdAssetIds.push(id);
  }

  const parsed = parseOrderDraft(
    {
      version: 8,
      idempotencyKey: createStudioOrderIdempotencyKey(),
      email: "studio-v8-test@example.com",
      document: dehydrated.document,
    },
    { studioDraftKey: draftKey },
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.draft.amountArs, PIECE_PRICE_ARS);
  assert.equal(parsed.draft.artwork.version, 8);

  const created = await savePendingOrder(parsed.draft);
  createdOrderIds.push(created.publicId);
  assert.ok(created.deliveryKey.length >= 32);

  const order = await findOrder(created.publicId);
  assert.ok(order);
  assert.equal(order.status, "PENDING");
  assert.equal(order.amountArs, PIECE_PRICE_ARS);
  assert.equal(order.artwork.version, 8);
  assert.equal(order.artwork.href, REVIEW_URL);
  assert.equal(documentHasDataUrls(order.artwork.document), false);
  assert.equal(JSON.stringify(order.artwork).includes("data:image"), false);
  assert.equal(order.artwork.document.parked.length, 0);

  const roundTrip = readArtworkSnapshot(order.artwork);
  assert.equal(roundTrip?.version, 8);
  assert.deepEqual(roundTrip?.assetIds, order.artwork.assetIds);

  const retained = await prisma.studioAsset.findMany({
    where: { orderId: created.publicId },
  });
  assert.ok(retained.length >= 1);
  for (const row of retained) {
    assert.equal(row.status, "RETAINED");
    assert.equal(row.expiresAt, null);
    assert.equal(row.draftKeyHash, draftHash);
  }

  // A Wi-Fi order keeps its password encrypted in the database and still renders with the real one.
  {
    const WIFI = "WIFI:T:WPA;S:Cafe Centro;P:clave-super-secreta;;";
    const wifiDraft = parseOrderDraft(
      {
        version: 8,
        idempotencyKey: createStudioOrderIdempotencyKey(),
        email: "studio-v8-test@example.com",
        document: withQr(createDocument("corporativo"), WIFI),
      },
      { studioDraftKey: draftKey },
    );
    assert.equal(wifiDraft.ok, true);
    const wifiOrder = await savePendingOrder(wifiDraft.draft);
    createdOrderIds.push(wifiOrder.publicId);
    const raw = await prisma.order.findUnique({ where: { id: wifiOrder.publicId }, select: { artwork: true } });
    const stored = JSON.stringify(raw.artwork);
    assert.equal(stored.includes("clave-super-secreta"), false, "password must not be stored in clear text");
    assert.equal(stored.includes("Cafe Centro"), false);
    assert.match(raw.artwork.href, /^sealed:v1:/);
    const read = await findOrder(wifiOrder.publicId);
    assert.equal(read.artwork.href, WIFI);
    assert.equal(read.artwork.document.elements.find((element) => element.type === "qr").value, WIFI);
    // Links are public by nature and stay readable in the database.
    const linkRow = await prisma.order.findUnique({ where: { id: created.publicId }, select: { artwork: true } });
    assert.equal(linkRow.artwork.href, REVIEW_URL);
  }

  // Snapshot immutability vs live document mutation
  const liveMutated = updateElement(dehydrated.document, dehydrated.document.elements[0].id, {});
  assert.ok(liveMutated);
  const again = await findOrder(created.publicId);
  assert.equal(again.artwork.frozenAt, order.artwork.frozenAt);
  assert.deepEqual(again.artwork.assetIds, order.artwork.assetIds);

  const parseV8 = (document, extra = {}) =>
    parseOrderDraft(
      {
        version: 8,
        idempotencyKey: createStudioOrderIdempotencyKey(),
        email: "studio-v8-test@example.com",
        document,
        ...extra,
      },
      { studioDraftKey: draftKey },
    );

  // Already-retained assets cannot be rebound to a second order
  const secondParsed = parseV8(dehydrated.document);
  assert.equal(secondParsed.ok, true);
  const ordersBeforeRebind = await prisma.order.count();
  await assert.rejects(() => savePendingOrder(secondParsed.draft), /order-assets/);
  assert.equal(await prisma.order.count(), ordersBeforeRebind);
  const stillFirst = await prisma.studioAsset.findMany({ where: { orderId: created.publicId } });
  assert.equal(stillFirst.length, retained.length);

  // Rollback: foreign asset must not leave a pending order behind
  const foreignDoc = withImage(
    withQr(createDocument("creativo"), REVIEW_URL),
    "stolen",
    `asset:${foreign.asset.id}`,
  );
  const foreignParsed = parseV8(foreignDoc);
  assert.equal(foreignParsed.ok, true);
  const ordersBeforeRollback = await prisma.order.count();
  await assert.rejects(() => savePendingOrder(foreignParsed.draft), /order-assets/);
  assert.equal(await prisma.order.count(), ordersBeforeRollback);

  // Missing asset
  const missingDoc = withImage(
    withQr(createDocument("creativo"), REVIEW_URL),
    "ghost",
    "asset:zzzzzzzzzzzzzzzzzzzzzzzz",
  );
  const missingParsed = parseV8(missingDoc);
  assert.equal(missingParsed.ok, true);
  await assert.rejects(() => savePendingOrder(missingParsed.draft), /order-assets/);

  // Reject client price / paid status at parse
  assert.equal(parseV8(dehydrated.document, { amountArs: 1 }).ok, false);

  const afterOrders = await prisma.order.count();
  const afterAssets = await prisma.studioAsset.count();
  assert.equal(afterOrders, beforeOrders + createdOrderIds.length);
  assert.ok(afterAssets >= beforeAssets + 1);

  console.log("studio-orders-pg.integration ok", {
    publicId: created.publicId,
    assets: retained.length,
    amountArs: order.amountArs,
  });
} finally {
  if (createdOrderIds.length > 0) {
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdAssetIds.length > 0) {
    await prisma.studioAsset.deleteMany({ where: { id: { in: createdAssetIds } } });
  }
  // Foreign assets from other draft may remain if not linked — clean by draft hashes used here.
  await prisma.studioAsset.deleteMany({
    where: { draftKeyHash: { in: [draftHash, otherHash] } },
  });
  await prisma.$disconnect();
}
