import { createHash } from "node:crypto";
import {
  buildPremiumArtwork,
  premiumDefaultMessage,
  premiumTemplates,
  type PremiumTemplateId,
} from "@/lib/artwork";
import { premiumAccent } from "@/lib/print/premium";
import { renderArtworkFile } from "@/lib/print/render";

const DEMO_REVIEW_URL = "https://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnopqrst";
export const DEMO_BUSINESS_NAME = "Tu negocio";

/** Landing samples are A6 posters (105 × 148 mm). */
export const SAMPLE_WIDTH_PX = 600;
export const SAMPLE_HEIGHT_PX = Math.round((SAMPLE_WIDTH_PX * 148) / 105);

export function sampleArtwork(templateId: PremiumTemplateId) {
  return buildPremiumArtwork({
    objective: "review",
    format: "poster",
    templateId,
    businessName: DEMO_BUSINESS_NAME,
    message: premiumDefaultMessage(templateId),
    accent: premiumAccent(templateId, "#1c1915"),
    href: DEMO_REVIEW_URL,
    logo: null,
  });
}

export function isSampleTemplate(id: string): id is PremiumTemplateId {
  return premiumTemplates.some((template) => template.id === id);
}

/**
 * Static image URL served by app/previews/plantilla/[id]/route.ts.
 * Inline SVG samples embedded every font as base64 (~700 KB of HTML).
 */
export function sampleImageUrl(templateId: PremiumTemplateId): string {
  const version = createHash("sha256").update(JSON.stringify(sampleArtwork(templateId))).digest("hex").slice(0, 10);
  return `/previews/plantilla/${templateId}?v=${version}`;
}

export async function renderSampleWebp(templateId: PremiumTemplateId): Promise<Buffer> {
  const file = await renderArtworkFile(sampleArtwork(templateId), "png");
  const { default: sharp } = await import("sharp");
  return sharp(file.body)
    .resize({ width: SAMPLE_WIDTH_PX, withoutEnlargement: true })
    .webp({ quality: 82, effort: 5 })
    .toBuffer();
}
