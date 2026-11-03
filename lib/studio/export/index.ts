import { compileStudioScene } from "@/lib/studio/export/compile";
import {
  isStudioExportFormat,
  renderStudioScene,
  renderStudioSvg,
  type StudioExportFormat,
} from "@/lib/studio/export/render";
import { validateForExport, type ExportValidation } from "@/lib/studio/export/validate";
import type { DesignDocumentV8 } from "@/lib/studio/types";

export type { StudioExportFormat, ExportValidation };
export { isStudioExportFormat, validateForExport, compileStudioScene, renderStudioSvg };

export type StudioExportResult =
  | { ok: true; body: Buffer; mime: string; format: StudioExportFormat; filename: string; validation: ExportValidation }
  | { ok: false; status: 400 | 422; error: "invalid-format" | "not-ready" | "render-failed"; validation?: ExportValidation };

export async function exportStudioDesign(
  document: DesignDocumentV8,
  format: string,
): Promise<StudioExportResult> {
  if (!isStudioExportFormat(format)) {
    return { ok: false, status: 400, error: "invalid-format" };
  }

  const validation = validateForExport(document);
  if (!validation.ready) {
    return { ok: false, status: 422, error: "not-ready", validation };
  }

  try {
    const scene = compileStudioScene(document);
    const file = await renderStudioScene(scene, format);
    return {
      ok: true,
      body: file.body,
      mime: file.mime,
      format,
      filename: studioExportFilename(document.templateId, format),
      validation,
    };
  } catch {
    return { ok: false, status: 400, error: "render-failed", validation };
  }
}

export function studioExportFilename(templateId: DesignDocumentV8["templateId"], format: StudioExportFormat): string {
  return `atajolab-studio-${templateId}.${format}`;
}

export function studioContentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
