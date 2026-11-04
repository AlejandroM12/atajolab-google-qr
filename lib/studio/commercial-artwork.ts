import { BUSINESS_NAME_MAX } from "@/lib/artwork";
import { collectStudioAssetIds, documentHasDataUrls } from "@/lib/studio/assets/document";
import { isDataImageUrl, isStudioAssetRef } from "@/lib/studio/assets/refs";
import { parseDesign } from "@/lib/studio/serialize";
import {
  A6_HEIGHT_MM,
  A6_WIDTH_MM,
  STUDIO_VERSION,
  type DesignDocumentV8,
  type QrElement,
  type StudioElement,
  type TemplateId,
} from "@/lib/studio/types";
import { validateForExport } from "@/lib/studio/export/validate";

/** Commercial Order.artwork version for Studio A6 designs. Distinct from legacy STUDIO_ARTWORK_VERSION (2). */
export const STUDIO_COMMERCIAL_ARTWORK_VERSION = STUDIO_VERSION;

export type StudioCommercialArtworkV8 = {
  version: typeof STUDIO_COMMERCIAL_ARTWORK_VERSION;
  /** QR destination frozen at order time. */
  href: string;
  format: {
    id: "a6";
    widthMm: typeof A6_WIDTH_MM;
    heightMm: typeof A6_HEIGHT_MM;
  };
  background: string;
  templateId: TemplateId;
  /** Commercial title derived from the printable design (role titulo). */
  title: string;
  /** ISO-8601 freeze timestamp. */
  frozenAt: string;
  /** Private asset ids referenced by printable elements only. */
  assetIds: string[];
  /**
   * Immutable printable document: parked elements excluded, layouts cleared,
   * image sources are `asset:<id>` refs only (never data URLs).
   */
  document: DesignDocumentV8;
};

export type BuildStudioCommercialError =
  | "invalid-document"
  | "studio-not-ready"
  | "studio-embedded-image"
  | "studio-remote-image";

/**
 * Freeze a DesignDocumentV8 into a commercial Order snapshot.
 * Parked elements are omitted from printable art; the caller's draft is not mutated.
 */
export function buildStudioCommercialArtwork(
  document: DesignDocumentV8,
  frozenAt: Date = new Date(),
): { ok: true; artwork: StudioCommercialArtworkV8 } | { ok: false; error: BuildStudioCommercialError } {
  if (document.version !== STUDIO_VERSION) return { ok: false, error: "invalid-document" };

  const printable = printableDocument(document);
  if (documentHasDataUrls(printable)) return { ok: false, error: "studio-embedded-image" };
  if (hasNonAssetImage(printable)) return { ok: false, error: "studio-remote-image" };

  const exportCheck = validateForExport(printable, { requireGoogleLink: true });
  if (!exportCheck.ready) return { ok: false, error: "studio-not-ready" };

  const qr = printable.elements.find((element): element is QrElement => element.type === "qr");
  if (!qr) return { ok: false, error: "studio-not-ready" };

  const assetIds = collectPrintableAssetIds(printable);
  const title = commercialTitle(printable);

  return {
    ok: true,
    artwork: {
      version: STUDIO_COMMERCIAL_ARTWORK_VERSION,
      href: qr.value.trim(),
      format: {
        id: "a6",
        widthMm: A6_WIDTH_MM,
        heightMm: A6_HEIGHT_MM,
      },
      background: printable.background,
      templateId: printable.templateId,
      title,
      frozenAt: frozenAt.toISOString(),
      assetIds,
      document: printable,
    },
  };
}

/** Re-validate a stored Order.artwork JSON blob for Studio v8. */
export function readStudioCommercialArtwork(value: unknown): StudioCommercialArtworkV8 | null {
  if (!isRecord(value)) return null;
  if (value.version !== STUDIO_COMMERCIAL_ARTWORK_VERSION) return null;
  if (typeof value.href !== "string" || value.href.trim().length < 1 || value.href.length > 2000) return null;
  if (typeof value.title !== "string" || value.title.trim() !== value.title || value.title.length < 1) return null;
  if (value.title.length > BUSINESS_NAME_MAX) return null;
  if (typeof value.frozenAt !== "string" || Number.isNaN(Date.parse(value.frozenAt))) return null;
  if (typeof value.background !== "string") return null;
  if (value.templateId !== "corporativo" && value.templateId !== "creativo") return null;
  if (!isRecord(value.format) || value.format.id !== "a6") return null;
  if (value.format.widthMm !== A6_WIDTH_MM || value.format.heightMm !== A6_HEIGHT_MM) return null;
  if (!Array.isArray(value.assetIds) || !value.assetIds.every((id) => typeof id === "string")) return null;

  if (!isRecord(value.document)) return null;
  const parsed = parseDesign(JSON.stringify(value.document));
  if (!parsed) return null;
  if (parsed.document.parked.length > 0) return null;
  if (Object.keys(parsed.document.layouts).length > 0) return null;
  if (documentHasDataUrls(parsed.document)) return null;
  if (hasNonAssetImage(parsed.document)) return null;

  const assetIds = uniqueStrings(value.assetIds);
  const fromDoc = collectPrintableAssetIds(parsed.document);
  if (assetIds.length !== fromDoc.length || assetIds.some((id) => !fromDoc.includes(id))) return null;

  if (parsed.document.background !== value.background) return null;
  if (parsed.document.templateId !== value.templateId) return null;

  const qr = parsed.document.elements.find((element): element is QrElement => element.type === "qr");
  if (!qr || qr.value.trim() !== value.href.trim()) return null;

  return {
    version: STUDIO_COMMERCIAL_ARTWORK_VERSION,
    href: value.href.trim(),
    format: { id: "a6", widthMm: A6_WIDTH_MM, heightMm: A6_HEIGHT_MM },
    background: parsed.document.background,
    templateId: parsed.document.templateId,
    title: value.title,
    frozenAt: value.frozenAt,
    assetIds,
    document: parsed.document,
  };
}

export function isStudioCommercialArtwork(
  value: unknown,
): value is StudioCommercialArtworkV8 {
  return readStudioCommercialArtwork(value) !== null;
}

/** Printable sheet only — parked + layout archives stay out of the commercial freeze. */
export function printableDocument(document: DesignDocumentV8): DesignDocumentV8 {
  return {
    version: STUDIO_VERSION,
    format: { id: "a6", widthMm: A6_WIDTH_MM, heightMm: A6_HEIGHT_MM },
    background: document.background,
    templateId: document.templateId,
    layouts: {},
    elements: document.elements.map(cloneElement),
    parked: [],
  };
}

function commercialTitle(document: DesignDocumentV8): string {
  const titled = document.elements.find(
    (element): element is Extract<StudioElement, { type: "text" }> =>
      element.type === "text" && element.role === "titulo",
  );
  const raw = (titled?.text ?? "").trim().replace(/\s+/g, " ");
  if (raw.length >= 1) return raw.slice(0, BUSINESS_NAME_MAX);
  return "Studio";
}

function collectPrintableAssetIds(document: DesignDocumentV8): string[] {
  return collectStudioAssetIds({ ...document, parked: [], layouts: {} });
}

function hasNonAssetImage(document: DesignDocumentV8): boolean {
  for (const element of document.elements) {
    if (element.type !== "image") continue;
    if (isDataImageUrl(element.src)) return true;
    if (!isStudioAssetRef(element.src)) return true;
  }
  return false;
}

function cloneElement(element: StudioElement): StudioElement {
  return { ...element };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
