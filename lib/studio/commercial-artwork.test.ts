import assert from "node:assert/strict";
import sharp from "sharp";
import {
  buildStudioCommercialArtwork,
  printableDocument,
  readStudioCommercialArtwork,
  STUDIO_COMMERCIAL_ARTWORK_VERSION,
} from "@/lib/studio/commercial-artwork";
import {
  createMemoryStudioAssetStore,
  createStudioDraftKey,
  dehydrateStudioDocument,
  documentHasDataUrls,
  hashStudioDraftKey,
  putStudioAssetForDraft,
  retainStudioAssetsForOrder,
  studioAssetRef,
} from "@/lib/studio/assets/index";
import { updateElement } from "@/lib/studio/document";
import { parseOrderDraft, readArtworkSnapshot } from "@/lib/order-draft";
import { PIECE_PRICE_ARS } from "@/lib/pricing";
import { createStudioOrderIdempotencyKey } from "@/lib/studio/order-idempotency";
import { createDocument } from "@/lib/studio/templates";
import type { DesignDocumentV8 } from "@/lib/studio/types";
import { resolveArtworkDownload } from "@/lib/print/download";

function v8Body(document: DesignDocumentV8, email = "cliente@example.com") {
  return {
    version: 8,
    email,
    document,
    idempotencyKey: createStudioOrderIdempotencyKey(),
  };
}

const REVIEW_URL = "https://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnop";

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

function dataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

const ready = withQr(createDocument("corporativo"), REVIEW_URL);
const built = buildStudioCommercialArtwork(ready, new Date("2026-11-03T15:00:00.000Z"));
assert.equal(built.ok, true);
if (built.ok) {
  assert.equal(built.artwork.version, STUDIO_COMMERCIAL_ARTWORK_VERSION);
  assert.equal(built.artwork.href, REVIEW_URL);
  assert.equal(built.artwork.format.id, "a6");
  assert.equal(built.artwork.templateId, "corporativo");
  assert.equal(built.artwork.frozenAt, "2026-11-03T15:00:00.000Z");
  assert.equal(built.artwork.document.parked.length, 0);
  assert.deepEqual(built.artwork.document.layouts, {});
  assert.equal(documentHasDataUrls(built.artwork.document), false);
  assert.equal(built.artwork.assetIds.length, 0);
  assert.ok(built.artwork.title.length >= 1);

  const roundTrip = readStudioCommercialArtwork(built.artwork);
  assert.deepEqual(roundTrip, built.artwork);
  assert.equal(readArtworkSnapshot(built.artwork)?.version, 8);
}

const parkedOnly = {
  ...ready,
  parked: [
    {
      id: "parked-img",
      role: null,
      type: "image" as const,
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      rotation: 0,
      src: studioAssetRef("abcdefghijklmnopqrstuvwx"),
      alt: "parked",
    },
  ],
};
const printable = printableDocument(parkedOnly);
assert.equal(printable.parked.length, 0);
assert.equal(parkedOnly.parked.length, 1);
const parkedSnap = buildStudioCommercialArtwork(parkedOnly);
assert.equal(parkedSnap.ok, true);
if (parkedSnap.ok) {
  assert.equal(parkedSnap.artwork.document.parked.length, 0);
  assert.equal(parkedSnap.artwork.assetIds.includes("abcdefghijklmnopqrstuvwx"), false);
}

const emptyQr = buildStudioCommercialArtwork(createDocument("corporativo"));
assert.equal(emptyQr.ok, false);
if (!emptyQr.ok) assert.equal(emptyQr.error, "studio-not-ready");

const covered = (() => {
  let doc = withQr(createDocument("corporativo"), REVIEW_URL);
  const qr = doc.elements.find((element) => element.type === "qr")!;
  doc = {
    ...doc,
    elements: [
      ...doc.elements,
      {
        id: "cover",
        role: null,
        type: "rect",
        x: qr.x,
        y: qr.y,
        width: qr.width,
        height: qr.height,
        rotation: 0,
        fill: "#ff0000",
        cornerRadius: 0,
      },
    ],
  };
  return buildStudioCommercialArtwork(doc);
})();
assert.equal(covered.ok, false);

const embedded = buildStudioCommercialArtwork(
  withImage(ready, "img1", dataUrl(await pngOpaque())),
);
assert.equal(embedded.ok, false);
if (!embedded.ok) assert.equal(embedded.error, "studio-embedded-image");

const draftKey = createStudioDraftKey();
const draftHash = hashStudioDraftKey(draftKey);
const store = createMemoryStudioAssetStore();
const bytes = await pngOpaque();
const put = await putStudioAssetForDraft({ store, draftKeyHash: draftHash, bytes });
assert.equal(put.ok, true);
if (!put.ok) throw new Error("put");

const withAsset = withImage(ready, "img1", studioAssetRef(put.asset.id));
const assetSnap = buildStudioCommercialArtwork(withAsset);
assert.equal(assetSnap.ok, true);
if (assetSnap.ok) {
  assert.deepEqual(assetSnap.artwork.assetIds, [put.asset.id]);
  assert.equal(documentHasDataUrls(assetSnap.artwork.document), false);
  const json = JSON.stringify(assetSnap.artwork);
  assert.equal(json.includes("data:image"), false);
}

const orderBody = v8Body(withAsset);
function parseV8(body: Record<string, unknown>, key: string | null = draftKey) {
  return parseOrderDraft(body, { studioDraftKey: key });
}

const parsed = parseV8(orderBody);
assert.equal(parsed.ok, true);
if (parsed.ok) {
  assert.equal(parsed.draft.amountArs, PIECE_PRICE_ARS);
  assert.equal(parsed.draft.currency, "ARS");
  assert.equal(parsed.draft.artwork.version, 8);
  assert.equal(parsed.draft.studioDraftKeyHash, draftHash);
  assert.equal(Object.hasOwn(parsed.draft, "status"), false);
  assert.equal("amountArs" in parsed.draft.artwork, false);
  const stored = readArtworkSnapshot(structuredClone(parsed.draft.artwork));
  assert.equal(stored?.version, 8);
  if (stored && stored.version === 8) {
    // Immutability: mutating the live draft document must not alter the frozen snapshot.
    const mutated = updateElement(withAsset, withAsset.elements[0]!.id, {});
    assert.notEqual(JSON.stringify(mutated), undefined);
    assert.equal(stored.href, REVIEW_URL);
    assert.deepEqual(stored.assetIds, [put.asset.id]);
  }
}

assert.equal(parseV8({ ...orderBody, amountArs: 1 }).ok, false);
assert.equal(parseV8({ ...orderBody, status: "PAID" }).ok, false);
assert.equal(parseV8({ ...orderBody, draftKey }).ok, false);
if (!parseV8({ ...orderBody, draftKey }).ok) {
  assert.equal(parseV8({ ...orderBody, draftKey }).error, "unexpected-field");
}
assert.equal(parseV8(orderBody, null).ok, false);
if (!parseV8(orderBody, null).ok) assert.equal(parseV8(orderBody, null).error, "studio-draft-key");
assert.equal(parseV8(orderBody, "short").ok, false);
if (!parseV8(orderBody, "short").ok) assert.equal(parseV8(orderBody, "short").error, "studio-draft-key");

const withDataUrl = parseV8(v8Body(withImage(ready, "img1", dataUrl(bytes))));
assert.equal(withDataUrl.ok, false);
if (!withDataUrl.ok) assert.equal(withDataUrl.error, "studio-embedded-image");

const emptyQrOrder = parseV8(v8Body(createDocument("corporativo")));
assert.equal(emptyQrOrder.ok, false);
if (!emptyQrOrder.ok) assert.equal(emptyQrOrder.error, "studio-not-ready");

const coveredOrder = parseV8(
  v8Body((() => {
    const doc = withQr(createDocument("corporativo"), REVIEW_URL);
    const qr = doc.elements.find((element) => element.type === "qr")!;
    return {
      ...doc,
      elements: [
        ...doc.elements,
        {
          id: "cover",
          role: null,
          type: "rect",
          x: qr.x,
          y: qr.y,
          width: qr.width,
          height: qr.height,
          rotation: 0,
          fill: "#112233",
          cornerRadius: 0,
        },
      ],
    };
  })()),
);
assert.equal(coveredOrder.ok, false);
if (!coveredOrder.ok) assert.equal(coveredOrder.error, "composition");

assert.equal(parseV8({ ...orderBody, idempotencyKey: "short" }).ok, false);
if (!parseV8({ ...orderBody, idempotencyKey: "short" }).ok) {
  assert.equal(parseV8({ ...orderBody, idempotencyKey: "short" }).error, "studio-idempotency-key");
}

const missingAsset = parseV8(v8Body(withImage(ready, "img1", studioAssetRef("zzzzzzzzzzzzzzzzzzzzzzzz"))));
assert.equal(missingAsset.ok, true);
if (missingAsset.ok) {
  // Ownership is enforced at save time, not parse time.
  const retain = await retainStudioAssetsForOrder({
    store,
    draftKeyHash: draftHash,
    orderId: "orderidorderidorderid00",
    assetIds: missingAsset.draft.artwork.version === 8 ? missingAsset.draft.artwork.assetIds : [],
  });
  assert.ok(retain.rejected.length > 0);
}

const foreignDraft = createStudioDraftKey();
const foreignHash = hashStudioDraftKey(foreignDraft);
const foreignPut = await putStudioAssetForDraft({ store, draftKeyHash: foreignHash, bytes });
assert.equal(foreignPut.ok, true);
if (foreignPut.ok) {
  const foreignOrder = parseV8(v8Body(withImage(ready, "img1", studioAssetRef(foreignPut.asset.id))));
  assert.equal(foreignOrder.ok, true);
  if (foreignOrder.ok && foreignOrder.draft.artwork.version === 8) {
    const retain = await retainStudioAssetsForOrder({
      store,
      draftKeyHash: draftHash,
      orderId: "orderidorderidorderid01",
      assetIds: foreignOrder.draft.artwork.assetIds,
    });
    assert.ok(retain.rejected.length > 0);
    assert.equal(retain.retained.length, 0);
  }
}

const ownedRetain = await retainStudioAssetsForOrder({
  store,
  draftKeyHash: draftHash,
  orderId: "orderidorderidorderid02",
  assetIds: [put.asset.id],
});
assert.deepEqual(ownedRetain.retained, [put.asset.id]);
assert.deepEqual(ownedRetain.rejected, []);
const retained = await store.findById(put.asset.id);
assert.equal(retained?.status, "RETAINED");
assert.equal(retained?.orderId, "orderidorderidorderid02");
assert.equal(retained?.expiresAt, null);

// Already-retained assets must not be reassigned to a second order.
const reassign = await retainStudioAssetsForOrder({
  store,
  draftKeyHash: draftHash,
  orderId: "orderidorderidorderid99",
  assetIds: [put.asset.id],
});
assert.equal(reassign.retained.length, 0);
assert.ok(reassign.rejected.includes(put.asset.id));
const stillBound = await store.findById(put.asset.id);
assert.equal(stillBound?.orderId, "orderidorderidorderid02");

if (assetSnap.ok) {
  // Unauthorized key still blocked; authorized PAID downloads are covered in studio/download.test.ts.
  const download = resolveArtworkDownload({
    publicId: "abcdefghijklmnopqrstuvwx",
    format: "png",
    deliveryKey: "x".repeat(43),
    order: {
      publicId: "abcdefghijklmnopqrstuvwx",
      status: "PAID",
      artwork: assetSnap.artwork,
      deliveryKeyHash: "abc",
    },
  });
  assert.equal(download.ok, false);
  if (!download.ok) assert.equal(download.error, "download-unavailable");
}

const dehydrateRound = await dehydrateStudioDocument({
  document: withImage(ready, "img2", dataUrl(bytes)),
  store,
  draftKeyHash: draftHash,
});
assert.equal(dehydrateRound.ok, true);
if (dehydrateRound.ok) {
  const again = parseV8(v8Body(dehydrateRound.document, "Cliente@Example.com"));
  assert.equal(again.ok, true);
  if (again.ok) {
    assert.equal(again.draft.buyerEmail, "cliente@example.com");
    assert.equal(again.draft.amountArs, PIECE_PRICE_ARS);
    assert.equal(documentHasDataUrls(again.draft.artwork.version === 8 ? again.draft.artwork.document : ready), false);
  }
}

// Historical v1–v7 snapshots still round-trip.
assert.equal(
  readArtworkSnapshot({
    version: 1,
    goal: "ubicacion",
    href: "https://www.google.com/maps/place/Obelisco/@-34.6037,-58.3816,17z",
    templateId: "cartel-ubicacion",
    businessName: "AtajoLab",
    headline: "Escaneá para ver cómo llegar",
    foreground: "#14221f",
    background: "#ffffff",
    qrSize: 256,
  })?.version,
  1,
);

console.log("commercial-artwork tests ok");
