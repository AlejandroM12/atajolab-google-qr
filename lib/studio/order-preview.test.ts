import assert from "node:assert/strict";
import {
  createMemoryStudioAssetStore,
  createStudioDraftKey,
  hashStudioDraftKey,
  putStudioAssetForDraft,
  retainStudioAssetsForOrder,
  studioAssetRef,
} from "@/lib/studio/assets/index";
import { buildStudioCommercialArtwork } from "@/lib/studio/commercial-artwork";
import { updateElement } from "@/lib/studio/document";
import { renderStudioOrderPreviewSvg } from "@/lib/studio/order-preview";
import { createDocument } from "@/lib/studio/templates";
import type { DesignDocumentV8 } from "@/lib/studio/types";

const REVIEW = "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4";

function withQr(document: DesignDocumentV8, value: string): DesignDocumentV8 {
  const qr = document.elements.find((element) => element.type === "qr");
  assert.ok(qr);
  return updateElement(document, qr.id, { value });
}

{
  const store = createMemoryStudioAssetStore();
  const draftHash = hashStudioDraftKey(createStudioDraftKey());
  const document = withQr(createDocument("corporativo"), REVIEW);
  const built = buildStudioCommercialArtwork(document);
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("build");

  const svg = await renderStudioOrderPreviewSvg({
    orderId: "cccccccccccccccccccccccc",
    artwork: built.artwork,
    store,
  });
  assert.ok(svg);
  assert.equal(svg.includes("<svg"), true);
  assert.equal(svg.includes(REVIEW), false);
  assert.equal(svg.toLowerCase().includes("data:image"), false);
}

{
  const store = createMemoryStudioAssetStore();
  const draftHash = hashStudioDraftKey(createStudioDraftKey());
  let document = withQr(createDocument("corporativo"), REVIEW);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const put = await putStudioAssetForDraft({ store, draftKeyHash: draftHash, bytes: png });
  assert.equal(put.ok, true);
  if (!put.ok) throw new Error("put");
  document = {
    ...document,
    elements: [
      ...document.elements,
      {
        id: "logo",
        role: null,
        type: "image",
        x: 12,
        y: 40,
        width: 20,
        height: 20,
        rotation: 0,
        src: studioAssetRef(put.asset.id),
        alt: "Logo",
        cornerRadius: 0,
        opacity: 1,
      },
    ],
  };
  const built = buildStudioCommercialArtwork(document);
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("build");

  await retainStudioAssetsForOrder({
    store,
    draftKeyHash: draftHash,
    orderId: "dddddddddddddddddddddddd",
    assetIds: built.artwork.assetIds,
  });

  const svg = await renderStudioOrderPreviewSvg({
    orderId: "dddddddddddddddddddddddd",
    artwork: built.artwork,
    store,
  });
  assert.ok(svg);
  assert.equal(svg.includes("<image"), true);
}

console.log("studio order-preview tests ok");
