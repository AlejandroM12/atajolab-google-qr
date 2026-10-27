import { artworkAttachment, resolveArtworkDownload } from "@/lib/print/download";
import { readOrderAccess } from "@/lib/payments/access";
import { findDownloadOrder } from "@/lib/orders";

export async function GET(
  request: Request,
  context: { params: Promise<{ publicId: string; format: string }> },
) {
  const { publicId, format } = await context.params;
  const order = await findDownloadOrder(publicId);
  const decision = resolveArtworkDownload({
    publicId,
    format,
    deliveryKey: readOrderAccess(request.headers.get("cookie"), publicId),
    order,
  });

  if (!decision.ok) {
    return Response.json(
      { error: decision.error },
      { status: decision.status, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const file = await artworkAttachment(decision.artwork, decision.format);
    return new Response(new Uint8Array(file.body), { headers: file.headers });
  } catch (error) {
    console.error("artwork export failed", error instanceof Error ? error.name : "unknown");
    return Response.json(
      { error: "export-failed" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
