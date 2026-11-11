import { createHash } from "node:crypto";
import { PREVIEW_RENDER_VERSION } from "@/lib/print/fonts";
import { inspirationDesigns, type InspirationId } from "@/lib/studio/inspiration";

/**
 * Public URLs of the gallery previews served by
 * app/previews/inspiracion/[id]/route.ts. The `v` hash changes whenever a
 * design changes, so browsers can cache each image for a long time.
 */
const versions = new Map<InspirationId, string>(
  inspirationDesigns.map((item) => [
    item.id,
    createHash("sha256").update(PREVIEW_RENDER_VERSION).update(JSON.stringify(item.document)).digest("hex").slice(0, 10),
  ]),
);

export function inspirationPreviewUrl(id: InspirationId): string {
  return `/previews/inspiracion/${id}?v=${versions.get(id) ?? "0"}`;
}

export function inspirationPreviewUrls(): Record<InspirationId, string> {
  return Object.fromEntries(
    inspirationDesigns.map((item) => [item.id, inspirationPreviewUrl(item.id)]),
  ) as Record<InspirationId, string>;
}

/** Pixel size of a gallery preview (600 px wide, see renderInspirationPreviewWebp). */
export function inspirationPreviewSize(id: InspirationId): { width: number; height: number } {
  const format = inspirationDesigns.find((item) => item.id === id)?.document.format;
  if (!format) return { width: 600, height: 846 };
  return { width: 600, height: Math.round((600 * format.heightMm) / format.widthMm) };
}
