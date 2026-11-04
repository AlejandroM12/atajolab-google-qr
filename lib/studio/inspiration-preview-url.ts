import { createHash } from "node:crypto";
import { inspirationDesigns, type InspirationId } from "@/lib/studio/inspiration";

/**
 * Public URLs of the gallery previews served by
 * app/previews/inspiracion/[id]/route.ts. The `v` hash changes whenever a
 * design changes, so browsers can cache each image for a long time.
 */
const versions = new Map<InspirationId, string>(
  inspirationDesigns.map((item) => [
    item.id,
    createHash("sha256").update(JSON.stringify(item.document)).digest("hex").slice(0, 10),
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
