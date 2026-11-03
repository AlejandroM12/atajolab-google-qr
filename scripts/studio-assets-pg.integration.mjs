/**
 * Real Postgres integration for Studio assets. Creates isolated rows and deletes them.
 * Run: node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-test.mjs scripts/studio-assets-pg.integration.mjs
 *
 * Refuses non-local DATABASE_URL (no Neon/production).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import sharp from "sharp";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost)(:\d+)?\//i.test(databaseUrl)) {
  throw new Error("studio-assets-pg.integration refuses non-local DATABASE_URL");
}

const { prisma } = await import("../lib/db.ts");
const {
  collectStudioAssetIds,
  createPrismaStudioAssetStore,
  createStudioDraftKey,
  dehydrateStudioDocument,
  documentHasDataUrls,
  hashStudioDraftKey,
  hydrateStudioDocument,
  putStudioAssetForDraft,
  purgeExpiredStudioAssets,
  retainStudioAssetsForOrder,
  STUDIO_ASSET_TEMP_TTL_MS,
} = await import("../lib/studio/assets/index.ts");
const { updateElement } = await import("../lib/studio/document.ts");
const { exportStudioDesign } = await import("../lib/studio/export/index.ts");
const { createDocument } = await import("../lib/studio/templates.ts");

const store = createPrismaStudioAssetStore(prisma);
const draftKey = createStudioDraftKey();
const draftHash = hashStudioDraftKey(draftKey);
const otherHash = hashStudioDraftKey(createStudioDraftKey());
const orderId = `testasset${Date.now().toString(36)}xx`.slice(0, 24).padEnd(24, "0");

const createdAssetIds = [];
let orderCreated = false;

async function pngAlpha() {
  return sharp({
    create: { width: 96, height: 96, channels: 4, background: { r: 20, g: 90, b: 80, alpha: 0.6 } },
  })
    .png()
    .toBuffer();
}

function dataUrl(bytes) {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function decodePng(body) {
  const image = PNG.sync.read(body);
  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data ?? null;
}

try {
  const beforeOrders = await prisma.order.count();
  const beforeAssets = await prisma.studioAsset.count();

  const enums = await prisma.$queryRawUnsafe(`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'StudioAssetStatus'
    ORDER BY e.enumsortorder
  `);
  assert.deepEqual(
    enums.map((row) => row.enumlabel),
    ["TEMPORARY", "RETAINED"],
  );

  const table = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'StudioAsset'
    ORDER BY ordinal_position
  `);
  const cols = Object.fromEntries(table.map((row) => [row.column_name, row.data_type]));
  assert.equal(cols.id, "text");
  assert.equal(cols.bytes, "bytea");
  assert.equal(cols.status, "USER-DEFINED");
  assert.ok(cols.draftKeyHash || cols.draftkeyhash || cols.draftKeyHash === undefined);
  assert.ok(Object.keys(cols).some((name) => name.toLowerCase() === "draftkeyhash"));
  assert.ok(Object.keys(cols).some((name) => name.toLowerCase() === "orderid"));

  const fks = await prisma.$queryRawUnsafe(`
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = '"StudioAsset"'::regclass AND contype = 'f'
  `);
  assert.ok(fks.some((row) => row.conname.includes("orderId") || row.conname.includes("Order")));

  const indexes = await prisma.$queryRawUnsafe(`
    SELECT indexname FROM pg_indexes WHERE tablename = 'StudioAsset'
  `);
  const indexNames = indexes.map((row) => row.indexname);
  assert.ok(indexNames.some((name) => name.includes("sha256")));
  assert.ok(indexNames.some((name) => name.includes("draftKeyHash") || name.includes("draftkeyhash")));

  const bytes = await pngAlpha();
  const put1 = await putStudioAssetForDraft({ store, draftKeyHash: draftHash, bytes });
  assert.equal(put1.ok, true);
  createdAssetIds.push(put1.asset.id);
  assert.equal(put1.asset.mime, "image/png");
  assert.equal(put1.asset.byteLength, put1.asset.bytes.length);
  assert.equal(put1.asset.sha256, createHash("sha256").update(put1.asset.bytes).digest("hex"));

  const put2 = await putStudioAssetForDraft({ store, draftKeyHash: draftHash, bytes });
  assert.equal(put2.ok, true);
  assert.equal(put2.reused, true);
  assert.equal(put2.asset.id, put1.asset.id);

  const foreign = await putStudioAssetForDraft({ store, draftKeyHash: otherHash, bytes });
  assert.equal(foreign.ok, true);
  createdAssetIds.push(foreign.asset.id);
  assert.notEqual(foreign.asset.id, put1.asset.id);

  let document = createDocument("corporativo");
  const qr = document.elements.find((element) => element.type === "qr");
  document = updateElement(document, qr.id, { value: "https://example.com/pg-assets" });
  document = {
    ...document,
    elements: [
      ...document.elements,
      {
        id: "pg-logo-1",
        role: null,
        type: "image",
        x: 10,
        y: 88,
        width: 18,
        height: 18,
        rotation: 0,
        src: dataUrl(bytes),
        alt: "logo-pg",
      },
    ],
  };

  const dehydrated = await dehydrateStudioDocument({ document, store, draftKeyHash: draftHash });
  assert.equal(dehydrated.ok, true);
  assert.equal(documentHasDataUrls(dehydrated.document), false);
  for (const id of dehydrated.assetIds) createdAssetIds.push(id);

  const blocked = await hydrateStudioDocument({
    document: dehydrated.document,
    store,
    scope: { kind: "draft", draftKeyHash: otherHash },
  });
  assert.equal(blocked.ok, false);

  // Create a throwaway order so FK retain works
  await prisma.order.create({
    data: {
      id: orderId,
      status: "PENDING",
      amountArs: 4900,
      currency: "ARS",
      artworkVersion: 7,
      artwork: { version: 7, href: "https://example.com/pg-assets", templateId: "classic", placeholder: true },
      buyerEmail: null,
    },
  });
  orderCreated = true;

  const partial = await retainStudioAssetsForOrder({
    store,
    draftKeyHash: draftHash,
    orderId,
    assetIds: [...collectStudioAssetIds(dehydrated.document), foreign.asset.id],
  });
  assert.equal(partial.retained.length, 0);
  assert.ok(partial.rejected.includes(foreign.asset.id));

  const stillTemp = await prisma.studioAsset.findUnique({ where: { id: put1.asset.id } });
  assert.equal(stillTemp.status, "TEMPORARY");

  const retained = await retainStudioAssetsForOrder({
    store,
    draftKeyHash: draftHash,
    orderId,
    assetIds: collectStudioAssetIds(dehydrated.document),
  });
  assert.ok(retained.retained.length > 0);
  assert.equal(retained.rejected.length, 0);

  const hydrated = await hydrateStudioDocument({
    document: dehydrated.document,
    store,
    scope: { kind: "order", orderId },
  });
  assert.equal(hydrated.ok, true);

  const exported = await exportStudioDesign(hydrated.document, "png");
  assert.equal(exported.ok, true);
  assert.equal(decodePng(exported.body), "https://example.com/pg-assets");

  const doomed = await putStudioAssetForDraft({
    store,
    draftKeyHash: otherHash,
    bytes: await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer(),
    now: new Date("2020-01-01T00:00:00.000Z"),
  });
  assert.equal(doomed.ok, true);
  createdAssetIds.push(doomed.asset.id);
  const removed = await purgeExpiredStudioAssets(store, new Date("2020-01-03T00:00:00.000Z"));
  assert.ok(removed >= 1);
  assert.equal(await prisma.studioAsset.findUnique({ where: { id: doomed.asset.id } }), null);

  const kept = await prisma.studioAsset.findUnique({ where: { id: put1.asset.id } });
  assert.equal(kept.status, "RETAINED");
  assert.equal(kept.orderId, orderId);
  assert.equal(kept.expiresAt, null);

  assert.equal(await prisma.order.count(), beforeOrders + 1);
  assert.ok((await prisma.studioAsset.count()) >= beforeAssets);

  console.log("studio assets pg integration ok", {
    orderId,
    retained: retained.retained.length,
    exportBytes: exported.body.length,
    tempTtlMs: STUDIO_ASSET_TEMP_TTL_MS,
  });
} finally {
  if (createdAssetIds.length > 0) {
    await prisma.studioAsset.deleteMany({ where: { id: { in: [...new Set(createdAssetIds)] } } });
  }
  if (orderCreated) {
    await prisma.order.delete({ where: { id: orderId } }).catch(() => {});
  }
  await prisma.$disconnect();
}
