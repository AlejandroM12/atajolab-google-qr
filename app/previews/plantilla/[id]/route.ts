import { premiumTemplates, type PremiumTemplateId } from "@/lib/artwork";
import { isSampleTemplate, renderSampleWebp } from "@/lib/landing-samples";

export async function generateStaticParams() {
  return premiumTemplates.map((template) => ({ id: template.id }));
}

/** Rendered once per process (or at build), then served from memory. */
const rendered = new Map<PremiumTemplateId, Promise<Buffer>>();

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isSampleTemplate(id)) return new Response(null, { status: 404 });

  let pending = rendered.get(id);
  if (!pending) {
    pending = renderSampleWebp(id).catch((error: unknown) => {
      rendered.delete(id);
      throw error;
    });
    rendered.set(id, pending);
  }
  const body = await pending;
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
