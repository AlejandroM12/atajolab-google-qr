import { getInspiration, inspirationDesigns, type InspirationId } from "@/lib/studio/inspiration";
import { renderInspirationPreviewWebp } from "@/lib/studio/inspiration-preview";

export async function generateStaticParams() {
  return inspirationDesigns.map((item) => ({ id: item.id }));
}

/**
 * Six small WebPs (~134 KB total). Each is rendered once per server process
 * and then served from memory; unknown ids get a cheap 404.
 */
const rendered = new Map<InspirationId, Promise<Buffer>>();

function preview(id: InspirationId, render: () => Promise<Buffer>): Promise<Buffer> {
  let pending = rendered.get(id);
  if (!pending) {
    pending = render().catch((error: unknown) => {
      rendered.delete(id);
      throw error;
    });
    rendered.set(id, pending);
  }
  return pending;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const design = getInspiration(id);
  if (!design) return new Response(null, { status: 404 });

  const body = await preview(design.id, () => renderInspirationPreviewWebp(design.document));
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": "image/webp",
      // URLs carry a content hash (?v=), so a long cache is safe.
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
