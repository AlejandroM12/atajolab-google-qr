import { isDataImageUrl, parseStudioAssetRef, studioAssetRef } from "@/lib/studio/assets/refs";
import type { DesignDocumentV8, ImageElement, StudioElement, TemplateLayoutSnapshot } from "@/lib/studio/types";

export type StudioUploadResult =
  | {
      ok: true;
      id: string;
      width: number;
      height: number;
      mime: string;
      byteLength: number;
      reused: boolean;
    }
  | { ok: false; error: string; status: number };

export type PrepareStudioOrderProgress = {
  total: number;
  completed: number;
  currentAlt: string | null;
};

export type PrepareStudioOrderResult =
  | {
      ok: true;
      /** Commercial payload with asset refs only — does not mutate the editor document. */
      commercialDocument: DesignDocumentV8;
      assetIds: string[];
      uploaded: number;
      reused: number;
    }
  | { ok: false; error: string; elementId: string | null };

/**
 * Ensure the HttpOnly draft cookie exists. Never stores the draftKey in JS storage.
 */
export async function ensureStudioDraftSession(
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  try {
    const response = await fetchImpl("/api/studio/draft", {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: body?.error ?? "draft-failed" };
    }
    const body = (await response.json()) as { created?: boolean };
    return { ok: true, created: Boolean(body.created) };
  } catch {
    return { ok: false, error: "draft-failed" };
  }
}

export async function uploadStudioAssetBytes(
  bytes: Blob,
  fetchImpl: typeof fetch = fetch,
): Promise<StudioUploadResult> {
  const form = new FormData();
  form.set("file", bytes, "image.bin");
  try {
    const response = await fetchImpl("/api/studio/assets", {
      method: "POST",
      credentials: "same-origin",
      body: form,
    });
    const body = (await response.json().catch(() => null)) as
      | {
          id?: string;
          width?: number;
          height?: number;
          mime?: string;
          byteLength?: number;
          reused?: boolean;
          error?: string;
        }
      | null;
    if (!response.ok || !body?.id) {
      return { ok: false, error: body?.error ?? "upload-failed", status: response.status };
    }
    return {
      ok: true,
      id: body.id,
      width: body.width ?? 0,
      height: body.height ?? 0,
      mime: body.mime ?? "image/png",
      byteLength: body.byteLength ?? 0,
      reused: Boolean(body.reused),
    };
  } catch {
    return { ok: false, error: "upload-failed", status: 0 };
  }
}

/**
 * Upload embedded data URLs for a commercial clone. The original editor document is unchanged.
 * Existing asset:<id> refs are kept as-is.
 */
export async function prepareStudioOrderDocument(input: {
  document: DesignDocumentV8;
  fetchImpl?: typeof fetch;
  onProgress?: (progress: PrepareStudioOrderProgress) => void;
  dataUrlToBlob?: (src: string) => Blob | null;
}): Promise<PrepareStudioOrderResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const toBlob = input.dataUrlToBlob ?? dataUrlToBlob;

  const session = await ensureStudioDraftSession(fetchImpl);
  if (!session.ok) return { ok: false, error: session.error, elementId: null };

  const cache = new Map<string, string>();
  const assetIds = new Set<string>();
  let uploaded = 0;
  let reused = 0;

  const images = listImageElements(input.document).filter(
    (element) => isDataImageUrl(element.src) || parseStudioAssetRef(element.src),
  );
  const pendingData = images.filter((element) => isDataImageUrl(element.src));
  let completed = 0;

  async function rewrite(element: StudioElement): Promise<
    | { ok: true; element: StudioElement }
    | { ok: false; error: string; elementId: string }
  > {
    if (element.type !== "image") return { ok: true, element };
    if (parseStudioAssetRef(element.src)) {
      assetIds.add(parseStudioAssetRef(element.src)!);
      return { ok: true, element };
    }
    if (!isDataImageUrl(element.src)) {
      return { ok: false, error: "invalid-data-url", elementId: element.id };
    }

    const cached = cache.get(element.src);
    if (cached) {
      assetIds.add(cached);
      return { ok: true, element: { ...element, src: studioAssetRef(cached) } };
    }

    input.onProgress?.({
      total: pendingData.length,
      completed,
      currentAlt: element.alt || "Imagen",
    });

    const blob = toBlob(element.src);
    if (!blob) return { ok: false, error: "invalid-data-url", elementId: element.id };

    let attempt = 0;
    let lastError = "upload-failed";
    while (attempt < 3) {
      attempt += 1;
      const uploadedAsset = await uploadStudioAssetBytes(blob, fetchImpl);
      if (uploadedAsset.ok) {
        cache.set(element.src, uploadedAsset.id);
        assetIds.add(uploadedAsset.id);
        if (uploadedAsset.reused) reused += 1;
        else uploaded += 1;
        completed += 1;
        input.onProgress?.({
          total: pendingData.length,
          completed,
          currentAlt: element.alt || "Imagen",
        });
        return { ok: true, element: { ...element, src: studioAssetRef(uploadedAsset.id) } };
      }
      lastError = uploadedAsset.error;
      if (uploadedAsset.status === 401 || uploadedAsset.status === 403 || uploadedAsset.status === 429) {
        break;
      }
    }
    return { ok: false, error: lastError, elementId: element.id };
  }

  async function rewriteList(list: StudioElement[]): Promise<
    | { ok: true; elements: StudioElement[] }
    | { ok: false; error: string; elementId: string }
  > {
    const next: StudioElement[] = [];
    for (const element of list) {
      const rewritten = await rewrite(element);
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

  return {
    ok: true,
    commercialDocument: {
      ...input.document,
      elements: elements.elements,
      parked: parked.elements,
      layouts,
    },
    assetIds: [...assetIds],
    uploaded,
    reused,
  };
}

function listImageElements(document: DesignDocumentV8): ImageElement[] {
  const lists = [
    document.elements,
    document.parked,
    ...Object.values(document.layouts ?? {}).flatMap((snapshot) =>
      snapshot ? [snapshot.elements, snapshot.parked] : [],
    ),
  ];
  const images: ImageElement[] = [];
  for (const list of lists) {
    for (const element of list) {
      if (element.type === "image") images.push(element);
    }
  }
  return images;
}

function dataUrlToBlob(src: string): Blob | null {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/]+={0,2})$/i.exec(src);
  if (!match) return null;
  try {
    const binary = atob(match[2]!);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: match[1]!.toLowerCase() });
  } catch {
    return null;
  }
}
