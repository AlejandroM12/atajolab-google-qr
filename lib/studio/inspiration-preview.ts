import { compileStudioScene, renderStudioSvg } from "@/lib/studio/export/index";
import type { DesignDocumentV8 } from "@/lib/studio/types";

/** Server-side SVG for an inspiration catalog design (no private assets). */
export function renderInspirationPreviewSvg(document: DesignDocumentV8): string {
  const scene = compileStudioScene(document);
  return renderStudioSvg(scene, "mm");
}
