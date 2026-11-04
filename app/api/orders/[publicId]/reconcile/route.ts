import { readJsonBody } from "@/lib/http/body";
import { isPublicId } from "@/lib/public-id";
import { deliveryKeysMatch, readOrderAccess } from "@/lib/payments/access";
import { reconcilePayment } from "@/lib/payments/checkout-service";
import { paymentRuntime } from "@/lib/payments/mercadopago";
import { applyVerifiedPayment, findPaymentRecord } from "@/lib/orders";
import { ROUTE_LIMITS, consumeBuckets, ipBucket, rateLimitedResponse } from "@/lib/rate-limit/policies";
import { studioClientKeyFromRequest, studioRequestTrusted } from "@/lib/studio/draft-session";
import { sharedRateLimiter } from "@/lib/studio/rate-limits";

export async function POST(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await context.params;
  if (!isPublicId(publicId)) return paymentError(404, "not-found");
  if (!studioRequestTrusted(request)) return paymentError(403, "origin-rejected");

  const body = await readJsonBody(request, 2000);
  if (body === undefined) return paymentError(400, "invalid-body");

  const byClient = await consumeBuckets(sharedRateLimiter(), [
    ipBucket("reconcile", studioClientKeyFromRequest(request), ROUTE_LIMITS.reconcileIp),
  ]);
  if (!byClient.ok) return rateLimitedResponse(byClient);

  // Authorize before the per-order bucket, so strangers who know the order id
  // cannot use up the buyer's checks.
  const deliveryKey = readOrderAccess(request.headers.get("cookie"), publicId);
  const record = await findPaymentRecord(publicId);
  if (!record) return paymentError(404, "not-found");
  if (!deliveryKeysMatch(deliveryKey ?? "", record.deliveryKeyHash)) {
    return paymentError(403, "checkout-unauthorized");
  }

  // Each reconcile can call Mercado Pago up to ~10 times; keep it bounded per order.
  const byOrder = await consumeBuckets(sharedRateLimiter(), [
    { key: `reconcile:order:${publicId}`, ...ROUTE_LIMITS.reconcileOrder },
  ]);
  if (!byOrder.ok) return rateLimitedResponse(byOrder);

  const runtime = await paymentRuntime();
  const result = await reconcilePayment({
    publicId,
    body,
    deliveryKey,
    accessToken: runtime.token,
    gateway: runtime.gateway,
    store: { find: findPaymentRecord, apply: applyVerifiedPayment },
  });

  if (!result.ok) return paymentError(result.status, result.error);

  return Response.json(
    { status: result.status },
    { headers: { "cache-control": "no-store" } },
  );
}

function paymentError(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}
