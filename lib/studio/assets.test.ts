import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  collectStudioAssetIds,
  createMemoryStudioAssetStore,
  createStudioDraftKey,
  dehydrateStudioDocument,
  documentHasDataUrls,
  hashStudioDraftKey,
  hydrateStudioDocument,
  processStudioImageBytes,
  purgeExpiredStudioAssets,
  putStudioAssetForDraft,
  readOwnedStudioAsset,
  retainStudioAssetsForOrder,
  studioAssetRef,
  STUDIO_ASSET_MAX_SOURCE_BYTES,
  STUDIO_ASSET_TEMP_TTL_MS,
} from "@/lib/studio/assets/index";
import { updateElement } from "@/lib/studio/document";
import { exportStudioDesign } from "@/lib/studio/export/index";
import { createDocument } from "@/lib/studio/templates";
import type { DesignDocumentV8 } from "@/lib/studio/types";

async function pngBytes(width: number, height: number, alpha = 255): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 20, g: 90, b: 80, alpha: alpha / 255 },
    },
  })
    .png()
    .toBuffer();
}

async function jpegBytes(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 40, g: 60, b: 180 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function webpBytes(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 200, g: 40, b: 40, alpha: 0.5 },
    },
  })
    .webp()
    .toBuffer();
}

function dataUrl(mime: string, bytes: Buffer): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
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

const draftKey = createStudioDraftKey();
const draftHash = hashStudioDraftKey(draftKey);
const otherHash = hashStudioDraftKey(createStudioDraftKey());
const store = createMemoryStudioAssetStore();

const pngOpaque = await sharp({
  create: { width: 64, height: 48, channels: 3, background: { r: 20, g: 90, b: 80 } },
})
  .png()
  .toBuffer();
const pngAlpha = await pngBytes(64, 48, 120);
const jpeg = await jpegBytes(80, 80);
const webp = await webpBytes(72, 72);

const okPng = await processStudioImageBytes(pngOpaque);
assert.equal(okPng.ok, true);
if (!okPng.ok) throw new Error("png");
assert.equal(okPng.mime, "image/jpeg");
assert.equal(okPng.sha256, createHash("sha256").update(okPng.bytes).digest("hex"));

const okAlpha = await processStudioImageBytes(pngAlpha);
assert.equal(okAlpha.ok, true);
if (!okAlpha.ok) throw new Error("alpha");
assert.equal(okAlpha.mime, "image/png");
assert.equal(okAlpha.hadAlpha, true);

assert.equal((await processStudioImageBytes(jpeg)).ok, true);

const okWebp = await processStudioImageBytes(webp);
assert.equal(okWebp.ok, true);
if (!okWebp.ok) throw new Error("webp");
assert.equal(okWebp.mime, "image/png");

assert.equal((await processStudioImageBytes(Buffer.alloc(0))).ok, false);
assert.equal((await processStudioImageBytes(Buffer.from("not-an-image"))).ok, false);
assert.equal((await processStudioImageBytes(Buffer.alloc(STUDIO_ASSET_MAX_SOURCE_BYTES + 1, 1))).ok, false);

const huge = await processStudioImageBytes(await pngBytes(1800, 1800, 255));
assert.equal(huge.ok, true);
if (!huge.ok) throw new Error("huge");
assert.ok(huge.width <= 1600 && huge.height <= 1600);

const put1 = await putStudioAssetForDraft({ store, draftKeyHash: draftHash, bytes: pngOpaque });
assert.equal(put1.ok, true);
if (!put1.ok) throw new Error("put1");
assert.equal(put1.reused, false);

const put2 = await putStudioAssetForDraft({ store, draftKeyHash: draftHash, bytes: pngOpaque });
assert.equal(put2.ok, true);
if (!put2.ok) throw new Error("put2");
assert.equal(put2.reused, true);
assert.equal(put2.asset.id, put1.asset.id);

assert.equal(await readOwnedStudioAsset(store, put1.asset.id, { kind: "draft", draftKeyHash: otherHash }), null);
assert.ok(await readOwnedStudioAsset(store, put1.asset.id, { kind: "draft", draftKeyHash: draftHash }));

let document = createDocument("corporativo");
const qr = document.elements.find((element) => element.type === "qr")!;
document = updateElement(document, qr.id, { value: "https://example.com/studio-assets" });
document = withImage(document, "img-1", dataUrl("image/png", pngAlpha));

const dehydrated = await dehydrateStudioDocument({ document, store, draftKeyHash: draftHash });
assert.equal(dehydrated.ok, true);
if (!dehydrated.ok) throw new Error("dehydrate");
assert.equal(documentHasDataUrls(dehydrated.document), false);
assert.ok(dehydrated.assetIds.length >= 1);
assert.ok(
  dehydrated.document.elements.some((element) => element.type === "image" && element.src.startsWith("asset:")),
);

const remote = await dehydrateStudioDocument({
  document: withImage(document, "img-remote", "https://evil.example/x.png"),
  store,
  draftKeyHash: draftHash,
});
assert.equal(remote.ok, false);
if (remote.ok) throw new Error("remote");
assert.equal(remote.error, "remote-url");

const hydrated = await hydrateStudioDocument({
  document: dehydrated.document,
  store,
  scope: { kind: "draft", draftKeyHash: draftHash },
});
assert.equal(hydrated.ok, true);
if (!hydrated.ok) throw new Error("hydrate");
assert.ok(documentHasDataUrls(hydrated.document));

const otherScope = await hydrateStudioDocument({
  document: dehydrated.document,
  store,
  scope: { kind: "draft", draftKeyHash: otherHash },
});
assert.equal(otherScope.ok, false);
if (otherScope.ok) throw new Error("other");
assert.equal(otherScope.error, "foreign-asset");

const missing = await hydrateStudioDocument({
  document: withImage(document, "img-missing", studioAssetRef("AAAAAAAAAAAAAAAAAAAAAAAA")),
  store,
  scope: { kind: "draft", draftKeyHash: draftHash },
});
assert.equal(missing.ok, false);
if (missing.ok) throw new Error("missing");
assert.equal(missing.error, "missing-asset");

const ids = collectStudioAssetIds(dehydrated.document);
const retained = await retainStudioAssetsForOrder({
  store,
  draftKeyHash: draftHash,
  orderId: "order-test-public-id0001",
  assetIds: ids,
});
assert.ok(retained.retained.length > 0);
assert.equal(retained.rejected.length, 0);

const orderHydrate = await hydrateStudioDocument({
  document: dehydrated.document,
  store,
  scope: { kind: "order", orderId: "order-test-public-id0001" },
});
assert.equal(orderHydrate.ok, true);
if (!orderHydrate.ok) throw new Error("order hydrate");

assert.equal(
  (
    await hydrateStudioDocument({
      document: dehydrated.document,
      store,
      scope: { kind: "order", orderId: "order-other-public-id0002" },
    })
  ).ok,
  false,
);

const exported = await exportStudioDesign(orderHydrate.document, "png");
assert.equal(exported.ok, true);

const expiredStore = createMemoryStudioAssetStore();
const now = new Date("2026-11-03T12:00:00.000Z");
const kept = await putStudioAssetForDraft({ store: expiredStore, draftKeyHash: draftHash, bytes: jpeg, now });
assert.equal(kept.ok, true);
if (!kept.ok) throw new Error("kept");
await retainStudioAssetsForOrder({
  store: expiredStore,
  draftKeyHash: draftHash,
  orderId: "order-keep-public-id0003",
  assetIds: [kept.asset.id],
});
const doomed = await putStudioAssetForDraft({ store: expiredStore, draftKeyHash: otherHash, bytes: pngOpaque, now });
assert.equal(doomed.ok, true);
if (!doomed.ok) throw new Error("doomed");
assert.equal(await purgeExpiredStudioAssets(expiredStore, new Date(now.getTime() + STUDIO_ASSET_TEMP_TTL_MS + 1000)), 1);
assert.equal(await expiredStore.findById(doomed.asset.id), null);
assert.ok(await expiredStore.findById(kept.asset.id));

const quotaStore = createMemoryStudioAssetStore();
for (let index = 0; index < 12; index += 1) {
  const put = await putStudioAssetForDraft({
    store: quotaStore,
    draftKeyHash: draftHash,
    bytes: await pngBytes(20 + index, 20 + index, 255),
  });
  assert.equal(put.ok, true, `quota ${index}`);
}
const over = await putStudioAssetForDraft({
  store: quotaStore,
  draftKeyHash: draftHash,
  bytes: await pngBytes(200, 200, 255),
});
assert.equal(over.ok, false);
if (over.ok) throw new Error("over");
assert.equal(over.error, "draft-quota");

console.log("studio assets ok");
