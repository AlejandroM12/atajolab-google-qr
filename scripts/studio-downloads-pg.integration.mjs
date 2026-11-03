/**
 * Real Postgres integration for Studio v8 paid downloads.
 * Creates an isolated order, marks it PAID locally (no Mercado Pago), exports PNG/SVG/PDF, then deletes fixtures.
 *
 * Run:
 *   node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-test.mjs scripts/studio-downloads-pg.integration.mjs
 *
 * Refuses non-local DATABASE_URL (no Neon/production).
 */
import assert from "node:assert/strict";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import sharp from "sharp";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost)(:\d+)?\//i.test(databaseUrl)) {
  throw new Error("studio-downloads-pg.integration refuses non-local DATABASE_URL");
}

const { prisma } = await import("../lib/db.ts");
const { parseOrderDraft } = await import("../lib/order-draft.ts");
const { findDownloadOrder, savePendingOrder } = await import("../lib/orders.ts");
const { buildOrderDownloadAttachment } = await import("../lib/print/download.ts");
const { createDeliveryKey, hashDeliveryKey } = await import("../lib/payments/access.ts");
const {
  createPrismaStudioAssetStore,
  createStudioDraftKey,
  dehydrateStudioDocument,
  documentHasDataUrls,
  hashStudioDraftKey,
} = await import("../lib/studio/assets/index.ts");
const { updateElement } = await import("../lib/studio/document.ts");
const { A6_HEIGHT_MM, A6_WIDTH_MM } = await import("../lib/studio/types.ts");
const { studioPrintPixels } = await import("../lib/studio/export/units.ts");
const { createDocument } = await import("../lib/studio/templates.ts");

const store = createPrismaStudioAssetStore(prisma);
const draftKey = createStudioDraftKey();
const draftHash = hashStudioDraftKey(draftKey);
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

function decodePng(body) {
  const image = PNG.sync.read(body);
  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data ?? null;
}

try {
  const bytes = await pngBytes();
  let document = withQr(createDocument("corporativo"), REVIEW_URL);
  document = withImage(document, "logo", `data:image/png;base64,${bytes.toString("base64")}`);
  const dehydrated = await dehydrateStudioDocument({
    document,
    store,
    draftKeyHash: draftHash,
  });
  assert.equal(dehydrated.ok, true);
  assert.equal(documentHasDataUrls(dehydrated.document), false);
  for (const id of dehydrated.assetIds) createdAssetIds.push(id);

  const parsed = parseOrderDraft({
    version: 8,
    email: "studio-v8-download@example.com",
    draftKey,
    document: dehydrated.document,
  });
  assert.equal(parsed.ok, true);

  const created = await savePendingOrder(parsed.draft);
  createdOrderIds.push(created.publicId);

  // Simulate PAID only on this isolated fixture — never touch Mercado Pago.
  await prisma.order.update({
    where: { id: created.publicId },
    data: { status: "PAID", paidAt: new Date() },
  });

  const order = await findDownloadOrder(created.publicId);
  assert.ok(order);
  assert.equal(order.status, "PAID");
  assert.equal(order.artwork.version, 8);

  const pendingDenied = await buildOrderDownloadAttachment({
    publicId: created.publicId,
    format: "png",
    deliveryKey: created.deliveryKey,
    order: { ...order, status: "PENDING" },
  });
  assert.equal(pendingDenied.ok, false);

  const noKey = await buildOrderDownloadAttachment({
    publicId: created.publicId,
    format: "png",
    deliveryKey: null,
    order,
  });
  assert.equal(noKey.ok, false);

  const wrongKey = await buildOrderDownloadAttachment({
    publicId: created.publicId,
    format: "png",
    deliveryKey: createDeliveryKey(),
    order,
  });
  assert.equal(wrongKey.ok, false);

  for (const format of ["png", "svg", "pdf"]) {
    const file = await buildOrderDownloadAttachment({
      publicId: created.publicId,
      format,
      deliveryKey: created.deliveryKey,
      order,
    });
    assert.equal(file.ok, true, format);
    assert.equal(file.headers["cache-control"], "private, no-store");
    assert.match(file.headers["content-disposition"], /studio-corporativo/);

    if (format === "png") {
      assert.equal(file.headers["content-type"], "image/png");
      const image = PNG.sync.read(file.body);
      assert.equal(image.width, studioPrintPixels(A6_WIDTH_MM));
      assert.equal(image.height, studioPrintPixels(A6_HEIGHT_MM));
      assert.equal(decodePng(file.body), REVIEW_URL);
    }
    if (format === "svg") {
      assert.equal(file.headers["content-type"], "image/svg+xml");
      const svg = file.body.toString("utf8");
      assert.match(svg, new RegExp(`width="${A6_WIDTH_MM}mm"`));
      assert.match(svg, new RegExp(`height="${A6_HEIGHT_MM}mm"`));
      const png = Buffer.from(
        new Resvg(svg, { fitTo: { mode: "width", value: studioPrintPixels(A6_WIDTH_MM) } }).render().asPng(),
      );
      assert.equal(decodePng(png), REVIEW_URL);
    }
    if (format === "pdf") {
      assert.equal(file.headers["content-type"], "application/pdf");
      assert.equal(file.body.subarray(0, 5).toString("utf8"), "%PDF-");
    }
  }

  // Delivery key hash must still match the cookie issued at create time.
  assert.equal(hashDeliveryKey(created.deliveryKey), order.deliveryKeyHash);

  console.log("studio-downloads-pg.integration ok", {
    publicId: created.publicId,
    assets: createdAssetIds.length,
  });
} finally {
  if (createdOrderIds.length > 0) {
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdAssetIds.length > 0) {
    await prisma.studioAsset.deleteMany({ where: { id: { in: createdAssetIds } } });
  }
  await prisma.studioAsset.deleteMany({ where: { draftKeyHash: draftHash } });
  await prisma.$disconnect();
}
