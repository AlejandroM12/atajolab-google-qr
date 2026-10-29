import {
  buildPremiumArtwork,
  premiumDefaultMessage,
  type PremiumTemplateId,
} from "@/lib/artwork";
import { premiumAccent } from "@/lib/print/premium";
import { renderArtworkSvg } from "@/lib/print/preview";

const DEMO_REVIEW_URL = "https://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnopqrst";
export const DEMO_BUSINESS_NAME = "Tu negocio";

export function designSampleSvg(templateId: PremiumTemplateId): string {
  const svg = renderArtworkSvg(
    buildPremiumArtwork({
      objective: "review",
      format: "poster",
      templateId,
      businessName: DEMO_BUSINESS_NAME,
      message: premiumDefaultMessage(templateId),
      accent: premiumAccent(templateId, "#1c1915"),
      href: DEMO_REVIEW_URL,
      logo: null,
    }),
  );
  return svg.replace(/^\s*<\?xml[^>]*>\s*/, "");
}
