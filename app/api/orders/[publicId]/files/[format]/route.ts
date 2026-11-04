import { isDatabaseUnavailable } from "@/lib/db-error";
import { logError } from "@/lib/log";
import { buildOrderDownloadAttachment, resolveArtworkDownload } from "@/lib/print/download";
import { readOrderAccess } from "@/lib/payments/access";
import { findDownloadOrder } from "@/lib/orders";
import { isPublicId } from "@/lib/public-id";
import { ROUTE_LIMITS, consumeBuckets, rateLimitedResponse } from "@/lib/rate-limit/policies";
import { sharedRateLimiter } from "@/lib/studio/rate-limits";

export async function GET(
  request: Request,
  context: { params: Promise<{ publicId: string; format: string }> },
) {
  const { publicId, format } = await context.params;
  if (!isPublicId(publicId)) return downloadError(404, "not-found");

  try {
    const order = await findDownloadOrder(publicId);
    const deliveryKey = readOrderAccess(request.headers.get("cookie"), publicId);

    // Authorize first (cheap), so strangers cannot use up the buyer's quota.
    const decision = resolveArtworkDownload({ publicId, format, deliveryKey, order });
    if (!decision.ok) return downloadError(decision.status, decision.error);

    // Every download renders from scratch (CPU heavy): cap per order.
    const limited = await consumeBuckets(sharedRateLimiter(), [
      { key: `download:order:${publicId}`, ...ROUTE_LIMITS.downloadOrder },
    ]);
    if (!limited.ok) return rateLimitedResponse(limited);

    // Authorize with the stored Order snapshot only — never accept a client design body.
    const file = await buildOrderDownloadAttachment({ publicId, format, deliveryKey, order });
    if (!file.ok) return downloadError(file.status, file.error);

    return new Response(new Uint8Array(file.body), { headers: file.headers });
  } catch (error) {
    logError("download.failed", error, { publicId, format });
    if (isDatabaseUnavailable(error)) return downloadError(503, "database-unavailable");
    return downloadError(500, "download-failed");
  }
}

function downloadError(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}
