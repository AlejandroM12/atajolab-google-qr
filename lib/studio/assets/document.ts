import {
  parseDataImageBytes,
  toDataImageUrl,
} from "@/lib/studio/assets/process";
import {
  isDataImageUrl,
  isStudioAssetRef,
  parseStudioAssetRef,
  studioAssetRef,
} from "@/lib/studio/assets/refs";
import {
  putStudioAssetForDraft,
  readOwnedStudioAsset,
  type AssetAccessScope,
  type PutStudioAssetError,
} from "@/lib/studio/assets/ownership";
import type { StudioAssetStore } from "@/lib/studio/assets/store";
import type { DesignDocumentV8, ImageElement, StudioElement, TemplateLayoutSnapshot } from "@/lib/studio/types";

export type DehydrateStudioError =
  | PutStudioAssetError
  | "remote-url"
  | "invalid-data-url"
  | "foreign-asset";

export type DehydrateStudioResult =
  | { ok: true; document: DesignDocumentV8; assetIds: string[] }
  | { ok: false; error: DehydrateStudioError; elementId: string | null };

export type HydrateStudioError = "missing-asset" | "foreign-asset" | "invalid-ref";

export type HydrateStudioResult =
  | { ok: true; document: DesignDocumentV8 }
  | { ok: false; error: HydrateStudioError; elementId: string | null; assetId: string | null };

/**
 * Replace embedded data URLs with private `asset:<id>` refs under a draft.
 * Rejects http(s)/file URLs. Output contains no data: image sources.
 */
export async function dehydrateStudioDocument(input: {
  document: DesignDocumentV8;
  store: StudioAssetStore;
  draftKeyHash: string;
  now?: Date;
}): Promise<DehydrateStudioResult> {
  const assetIds = new Set<string>();
  const cache = new Map<string, string>();

  async function rewriteElement(element: StudioElement): Promise<
    | { ok: true; element: StudioElement }
    | { ok: false; error: DehydrateStudioError; elementId: string }
  > {
    if (element.type !== "image") return { ok: true, element };
    const src = element.src;
    if (isStudioAssetRef(src)) {
      const id = parseStudioAssetRef(src)!;
      const owned = await readOwnedStudioAsset(input.store, id, {
        kind: "draft",
        draftKeyHash: input.draftKeyHash,
      });
      if (!owned) return { ok: false, error: "foreign-asset", elementId: element.id };
      assetIds.add(id);
      return { ok: true, element };
    }
    if (/^https?:\/\//i.test(src) || /^file:/i.test(src) || src.startsWith("//")) {
      return { ok: false, error: "remote-url", elementId: element.id };
    }
    if (!isDataImageUrl(src)) return { ok: false, error: "invalid-data-url", elementId: element.id };

    const cached = cache.get(src);
    if (cached) {
      assetIds.add(cached);
      return { ok: true, element: withSrc(element, studioAssetRef(cached)) };
    }

    const parsed = parseDataImageBytes(src);
    if (!parsed) return { ok: false, error: "invalid-data-url", elementId: element.id };

    const put = await putStudioAssetForDraft({
      store: input.store,
      draftKeyHash: input.draftKeyHash,
      bytes: parsed.bytes,
      now: input.now,
    });
    if (!put.ok) return { ok: false, error: put.error, elementId: element.id };

    cache.set(src, put.asset.id);
    assetIds.add(put.asset.id);
    return { ok: true, element: withSrc(element, studioAssetRef(put.asset.id)) };
  }

  async function rewriteList(list: StudioElement[]): Promise<
    | { ok: true; elements: StudioElement[] }
    | { ok: false; error: DehydrateStudioError; elementId: string }
  > {
    const next: StudioElement[] = [];
    for (const element of list) {
      const rewritten = await rewriteElement(element);
      if (!rewritten.ok) return rewritten;
      next.push(rewritten.element);
    }
    return { ok: true, elements: next };
  }

  const elements = await rewriteList(input.document.elements);
  if (!elements.ok) return { ok: false, error: elements.error, elementId: elements.elementId };

  const parked = await rewriteList(input.document.parked);
  if (!parked.ok) return { ok: false, error: parked.error, elementId: parked.elementId };

  const layouts: DesignDocumentV8["layouts"] = {};
  for (const [key, snapshot] of Object.entries(input.document.layouts ?? {}) as [
    keyof DesignDocumentV8["layouts"],
    TemplateLayoutSnapshot,
  ][]) {
    if (!snapshot) continue;
    const layoutElements = await rewriteList(snapshot.elements);
    if (!layoutElements.ok) {
      return { ok: false, error: layoutElements.error, elementId: layoutElements.elementId };
    }
    const layoutParked = await rewriteList(snapshot.parked);
    if (!layoutParked.ok) {
      return { ok: false, error: layoutParked.error, elementId: layoutParked.elementId };
    }
    layouts[key] = { elements: layoutElements.elements, parked: layoutParked.elements };
  }

  const document: DesignDocumentV8 = {
    ...input.document,
    elements: elements.elements,
    parked: parked.elements,
    layouts,
  };

  if (documentHasDataUrls(document)) {
    return { ok: false, error: "invalid-data-url", elementId: null };
  }

  return { ok: true, document, assetIds: [...assetIds] };
}

/**
 * Resolve `asset:<id>` refs for export. Requires draft or order ownership scope.
 */
export async function hydrateStudioDocument(input: {
  document: DesignDocumentV8;
  store: StudioAssetStore;
  scope: AssetAccessScope;
}): Promise<HydrateStudioResult> {
  async function rewriteElement(element: StudioElement): Promise<
    | { ok: true; element: StudioElement }
    | { ok: false; error: HydrateStudioError; elementId: string; assetId: string | null }
  > {
    if (element.type !== "image") return { ok: true, element };
    if (isDataImageUrl(element.src)) return { ok: true, element };
    const id = parseStudioAssetRef(element.src);
    if (!id) return { ok: false, error: "invalid-ref", elementId: element.id, assetId: null };
    const asset = await readOwnedStudioAsset(input.store, id, input.scope);
    if (!asset) {
      const exists = await input.store.findById(id);
      return {
        ok: false,
        error: exists ? "foreign-asset" : "missing-asset",
        elementId: element.id,
        assetId: id,
      };
    }
    return {
      ok: true,
      element: withSrc(element, toDataImageUrl(asset.mime, asset.bytes)),
    };
  }

  async function rewriteList(list: StudioElement[]): Promise<
    | { ok: true; elements: StudioElement[] }
    | { ok: false; error: HydrateStudioError; elementId: string; assetId: string | null }
  > {
    const next: StudioElement[] = [];
    for (const element of list) {
      const rewritten = await rewriteElement(element);
      if (!rewritten.ok) return rewritten;
      next.push(rewritten.element);
    }
    return { ok: true, elements: next };
  }

  const elements = await rewriteList(input.document.elements);
  if (!elements.ok) {
    return { ok: false, error: elements.error, elementId: elements.elementId, assetId: elements.assetId };
  }
  const parked = await rewriteList(input.document.parked);
  if (!parked.ok) {
    return { ok: false, error: parked.error, elementId: parked.elementId, assetId: parked.assetId };
  }

  const layouts: DesignDocumentV8["layouts"] = {};
  for (const [key, snapshot] of Object.entries(input.document.layouts ?? {}) as [
    keyof DesignDocumentV8["layouts"],
    TemplateLayoutSnapshot,
  ][]) {
    if (!snapshot) continue;
    const layoutElements = await rewriteList(snapshot.elements);
    if (!layoutElements.ok) {
      return {
        ok: false,
        error: layoutElements.error,
        elementId: layoutElements.elementId,
        assetId: layoutElements.assetId,
      };
    }
    const layoutParked = await rewriteList(snapshot.parked);
    if (!layoutParked.ok) {
      return {
        ok: false,
        error: layoutParked.error,
        elementId: layoutParked.elementId,
        assetId: layoutParked.assetId,
      };
    }
    layouts[key] = { elements: layoutElements.elements, parked: layoutParked.elements };
  }

  return {
    ok: true,
    document: {
      ...input.document,
      elements: elements.elements,
      parked: parked.elements,
      layouts,
    },
  };
}

export function documentHasDataUrls(document: DesignDocumentV8): boolean {
  const lists = [
    document.elements,
    document.parked,
    ...Object.values(document.layouts ?? {}).flatMap((snapshot) =>
      snapshot ? [snapshot.elements, snapshot.parked] : [],
    ),
  ];
  for (const list of lists) {
    for (const element of list) {
      if (element.type === "image" && isDataImageUrl(element.src)) return true;
    }
  }
  return false;
}

export function collectStudioAssetIds(document: DesignDocumentV8): string[] {
  const ids = new Set<string>();
  const lists = [
    document.elements,
    document.parked,
    ...Object.values(document.layouts ?? {}).flatMap((snapshot) =>
      snapshot ? [snapshot.elements, snapshot.parked] : [],
    ),
  ];
  for (const list of lists) {
    for (const element of list) {
      if (element.type !== "image") continue;
      const id = parseStudioAssetRef(element.src);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

function withSrc(element: ImageElement, src: string): ImageElement {
  return { ...element, src };
}
