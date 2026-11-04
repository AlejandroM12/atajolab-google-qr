import { compileStudioScene, exportStudioDesign, renderStudioSvg } from "@/lib/studio/export/index";
import type { DesignDocumentV8 } from "@/lib/studio/types";

/** SVG markup (unitless) for tests / non-HTML consumers. */
export function renderInspirationPreviewSvg(document: DesignDocumentV8): string {
  const scene = compileStudioScene(document);
  return renderStudioSvg(scene, "mm")
    .replace(
      `width="${scene.widthMm}mm" height="${scene.heightMm}mm"`,
      `width="100%" height="100%" preserveAspectRatio="xMidYMid meet"`,
    );
}

/**
 * PNG data URL from the same export pipeline as print downloads.
 * Use this for HTML gallery cards so browser SVG baseline quirks cannot clip text.
 */
export async function renderInspirationPreviewDataUrl(document: DesignDocumentV8): Promise<string> {
  const exported = await exportStudioDesign(document, "png");
  if (!exported.ok) {
    throw new Error(`inspiration-preview-failed:${exported.error}`);
  }
  return `data:${exported.mime};base64,${exported.body.toString("base64")}`;
}

/** Gallery cards are ~300 CSS px wide; 2x for sharp text on phones. */
export const INSPIRATION_PREVIEW_WIDTH_PX = 600;

/**
 * Small WebP for gallery cards, from the same export pipeline as print files.
 * A print PNG is ~1240×1748 px; this is a fraction of the bytes.
 */
export async function renderInspirationPreviewWebp(document: DesignDocumentV8): Promise<Buffer> {
  const exported = await exportStudioDesign(document, "png");
  if (!exported.ok) {
    throw new Error(`inspiration-preview-failed:${exported.error}`);
  }
  const { default: sharp } = await import("sharp");
  return sharp(exported.body)
    .resize({ width: INSPIRATION_PREVIEW_WIDTH_PX, withoutEnlargement: true })
    .webp({ quality: 82, effort: 5 })
    .toBuffer();
}
