import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import sharp from "sharp";
import {
  buildOrderDownloadAttachment,
  resolveArtworkDownload,
  studioCommercialFilename,
  type DownloadOrder,
} from "@/lib/print/download";
import { createDeliveryKey, hashDeliveryKey } from "@/lib/payments/access";
import {
  buildStudioCommercialArtwork,
  STUDIO_COMMERCIAL_ARTWORK_VERSION,
} from "@/lib/studio/commercial-artwork";
import {
  createMemoryStudioAssetStore,
  createStudioDraftKey,
  dehydrateStudioDocument,
  hashStudioDraftKey,
  putStudioAssetForDraft,
  retainStudioAssetsForOrder,
  studioAssetRef,
} from "@/lib/studio/assets/index";
import { updateElement } from "@/lib/studio/document";
import { A6_HEIGHT_MM, A6_WIDTH_MM, type DesignDocumentV8 } from "@/lib/studio/types";
import { studioPrintPixels } from "@/lib/studio/export/units";
import { createDocument } from "@/lib/studio/templates";

const REVIEW_URL = "https://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnop";
const publicId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const key = createDeliveryKey();
const foreignKey = createDeliveryKey();

function withQr(document: DesignDocumentV8, value: string): DesignDocumentV8 {
  const qr = document.elements.find((element) => element.type === "qr");
  assert.ok(qr);
  return updateElement(document, qr.id, { value });
}

function withImage(document: DesignDocumentV8, id: string, src: string): DesignDocumentV8 {
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

async function pngOpaque(): Promise<Buffer> {
  return sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: 20, g: 90, b: 80 } },
  })
    .png()
    .toBuffer();
}

function decodePng(body: Buffer): string | null {
  const image = PNG.sync.read(body);
  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data ?? null;
}

function decodeSvg(body: Buffer): string | null {
  const png = new Resvg(body.toString("utf8"), {
    fitTo: { mode: "width", value: studioPrintPixels(A6_WIDTH_MM) },
  })
    .render()
    .asPng();
  return decodePng(Buffer.from(png));
}

function pdfStreams(body: Buffer): Buffer[] {
  const source = body.toString("latin1");
  const streams: Buffer[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf("stream", cursor);
    if (start < 0) break;
    let dataStart = start + 6;
    if (source.charCodeAt(dataStart) === 13) dataStart += 1;
    if (source.charCodeAt(dataStart) === 10) dataStart += 1;
    const end = source.indexOf("endstream", dataStart);
    if (end < 0) break;
    const raw = Buffer.from(source.slice(dataStart, end).replace(/\r?\n$/, ""), "latin1");
    try {
      streams.push(inflateSync(raw));
    } catch {
      streams.push(raw);
    }
    cursor = end + 9;
  }
  return streams;
}

const store = createMemoryStudioAssetStore();
const draftHash = hashStudioDraftKey(createStudioDraftKey());
const bytes = await pngOpaque();
const put = await putStudioAssetForDraft({ store, draftKeyHash: draftHash, bytes });
assert.equal(put.ok, true);
if (!put.ok) throw new Error("put");

let document = withQr(createDocument("corporativo"), REVIEW_URL);
document = withImage(document, "logo", studioAssetRef(put.asset.id));
const built = buildStudioCommercialArtwork(document);
assert.equal(built.ok, true);
if (!built.ok) throw new Error("build");

await retainStudioAssetsForOrder({
  store,
  draftKeyHash: draftHash,
  orderId: publicId,
  assetIds: built.artwork.assetIds,
});

function paidOrder(overrides: Partial<DownloadOrder> = {}): DownloadOrder {
  return {
    publicId,
    status: "PAID",
    artwork: built.artwork,
    deliveryKeyHash: hashDeliveryKey(key),
    ...overrides,
  };
}

{
  const deniedPending = resolveArtworkDownload({
    publicId,
    format: "png",
    deliveryKey: key,
    order: paidOrder({ status: "PENDING" }),
  });
  assert.deepEqual(deniedPending, { ok: false, status: 403, error: "download-unavailable" });

  const deniedNoKey = resolveArtworkDownload({
    publicId,
    format: "png",
    deliveryKey: null,
    order: paidOrder(),
  });
  assert.deepEqual(deniedNoKey, { ok: false, status: 403, error: "download-unavailable" });

  const deniedForeign = resolveArtworkDownload({
    publicId,
    format: "png",
    deliveryKey: foreignKey,
    order: paidOrder(),
  });
  assert.deepEqual(deniedForeign, { ok: false, status: 403, error: "download-unavailable" });

  const allowed = resolveArtworkDownload({
    publicId,
    format: "png",
    deliveryKey: key,
    order: paidOrder(),
  });
  assert.equal(allowed.ok, true);
  if (allowed.ok) assert.equal(allowed.artwork.version, STUDIO_COMMERCIAL_ARTWORK_VERSION);
}

{
  const accessKey = createDeliveryKey();
  const viaCredential = resolveArtworkDownload({
    publicId,
    format: "svg",
    deliveryKey: accessKey,
    order: paidOrder({
      deliveryKeyHash: hashDeliveryKey(key),
      accessKeyHashes: [hashDeliveryKey(accessKey)],
    }),
  });
  assert.equal(viaCredential.ok, true);
}

for (const format of ["png", "svg", "pdf"] as const) {
  const file = await buildOrderDownloadAttachment({
    publicId,
    format,
    deliveryKey: key,
    order: paidOrder(),
    store,
  });
  assert.equal(file.ok, true);
  if (!file.ok) throw new Error(format);
  assert.equal(file.headers["cache-control"], "private, no-store");
  assert.match(file.headers["content-disposition"] ?? "", /attachment;/);
  assert.match(file.headers["content-disposition"] ?? "", /studio-corporativo/);
  assert.equal(studioCommercialFilename(built.artwork, format).endsWith(`.${format}`), true);

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
    assert.equal(decodeSvg(file.body), REVIEW_URL);
  }
  if (format === "pdf") {
    assert.equal(file.headers["content-type"], "application/pdf");
    assert.equal(file.body.subarray(0, 5).toString("utf8"), "%PDF-");
    const streams = pdfStreams(file.body);
    assert.ok(streams.length > 0);
  }
}

{
  const pending = await buildOrderDownloadAttachment({
    publicId,
    format: "png",
    deliveryKey: key,
    order: paidOrder({ status: "PENDING" }),
    store,
  });
  assert.deepEqual(pending, { ok: false, status: 403, error: "download-unavailable" });
}

{
  const missingStore = createMemoryStudioAssetStore();
  const ghost = buildStudioCommercialArtwork(
    withImage(withQr(createDocument("creativo"), REVIEW_URL), "ghost", studioAssetRef("zzzzzzzzzzzzzzzzzzzzzzzz")),
  );
  assert.equal(ghost.ok, true);
  if (!ghost.ok) throw new Error("ghost");
  const missing = await buildOrderDownloadAttachment({
    publicId,
    format: "png",
    deliveryKey: key,
    order: {
      publicId,
      status: "PAID",
      artwork: ghost.artwork,
      deliveryKeyHash: hashDeliveryKey(key),
    },
    store: missingStore,
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error, "asset-unavailable");
}

{
  const otherOrderId = "cccccccccccccccccccccccc";
  const foreignStore = createMemoryStudioAssetStore();
  const foreignPut = await putStudioAssetForDraft({
    store: foreignStore,
    draftKeyHash: hashStudioDraftKey(createStudioDraftKey()),
    bytes,
  });
  assert.equal(foreignPut.ok, true);
  if (!foreignPut.ok) throw new Error("foreign put");
  await retainStudioAssetsForOrder({
    store: foreignStore,
    draftKeyHash: foreignPut.asset.draftKeyHash!,
    orderId: otherOrderId,
    assetIds: [foreignPut.asset.id],
  });

  const stolen = buildStudioCommercialArtwork(
    withImage(withQr(createDocument("creativo"), REVIEW_URL), "stolen", studioAssetRef(foreignPut.asset.id)),
  );
  assert.equal(stolen.ok, true);
  if (!stolen.ok) throw new Error("stolen");

  const denied = await buildOrderDownloadAttachment({
    publicId,
    format: "png",
    deliveryKey: key,
    order: {
      publicId,
      status: "PAID",
      artwork: stolen.artwork,
      deliveryKeyHash: hashDeliveryKey(key),
    },
    store: foreignStore,
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error, "asset-unavailable");
}

{
  const broken = structuredClone(built.artwork);
  broken.document.parked = [
    {
      id: "leak",
      role: null,
      type: "rect",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      rotation: 0,
      fill: "#000000",
      cornerRadius: 0,
    },
  ];
  const invalid = await buildOrderDownloadAttachment({
    publicId,
    format: "png",
    deliveryKey: key,
    order: {
      publicId,
      status: "PAID",
      artwork: broken,
      deliveryKeyHash: hashDeliveryKey(key),
    },
    store,
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error, "invalid-snapshot");
}

{
  // Auth must fail before any hydrate attempt when key is wrong — even with a valid store.
  const noHydrate = await buildOrderDownloadAttachment({
    publicId,
    format: "png",
    deliveryKey: foreignKey,
    order: paidOrder(),
    store,
  });
  assert.deepEqual(noHydrate, { ok: false, status: 403, error: "download-unavailable" });
}

{
  // Dehydrated document round-trip still exports without depending on STUDIO_EXPORT_ENABLED.
  const previous = process.env.STUDIO_EXPORT_ENABLED;
  process.env.STUDIO_EXPORT_ENABLED = "false";
  try {
    const draft = createStudioDraftKey();
    const hash = hashStudioDraftKey(draft);
    const local = createMemoryStudioAssetStore();
    const embedded = withImage(
      withQr(createDocument("corporativo"), REVIEW_URL),
      "logo",
      `data:image/png;base64,${bytes.toString("base64")}`,
    );
    const dehydrated = await dehydrateStudioDocument({ document: embedded, store: local, draftKeyHash: hash });
    assert.equal(dehydrated.ok, true);
    if (!dehydrated.ok) throw new Error("dehydrate");
    const snap = buildStudioCommercialArtwork(dehydrated.document);
    assert.equal(snap.ok, true);
    if (!snap.ok) throw new Error("snap");
    await retainStudioAssetsForOrder({
      store: local,
      draftKeyHash: hash,
      orderId: publicId,
      assetIds: snap.artwork.assetIds,
    });
    const file = await buildOrderDownloadAttachment({
      publicId,
      format: "png",
      deliveryKey: key,
      order: {
        publicId,
        status: "PAID",
        artwork: snap.artwork,
        deliveryKeyHash: hashDeliveryKey(key),
      },
      store: local,
    });
    assert.equal(file.ok, true);
    if (file.ok) assert.equal(decodePng(file.body), REVIEW_URL);
  } finally {
    if (previous === undefined) delete process.env.STUDIO_EXPORT_ENABLED;
    else process.env.STUDIO_EXPORT_ENABLED = previous;
  }
}

console.log("studio download tests ok");
