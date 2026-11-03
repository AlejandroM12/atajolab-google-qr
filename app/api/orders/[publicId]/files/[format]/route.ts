import { buildOrderDownloadAttachment } from "@/lib/print/download";
import { readOrderAccess } from "@/lib/payments/access";
import { findDownloadOrder } from "@/lib/orders";

export async function GET(
  request: Request,
  context: { params: Promise<{ publicId: string; format: string }> },
) {
  const { publicId, format } = await context.params;
  const order = await findDownloadOrder(publicId);

  // Authorize with the stored Order snapshot only — never accept a client design body.
  const file = await buildOrderDownloadAttachment({
    publicId,
    format,
    deliveryKey: readOrderAccess(request.headers.get("cookie"), publicId),
    order,
  });

  if (!file.ok) {
    return Response.json(
      { error: file.error },
      { status: file.status, headers: { "cache-control": "no-store" } },
    );
  }

  return new Response(new Uint8Array(file.body), { headers: file.headers });
}
