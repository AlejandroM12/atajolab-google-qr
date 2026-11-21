import { isDatabaseUnavailable } from "@/lib/db-error";
import { findOrder, findPaymentRecord, savePreferenceId } from "@/lib/orders";
import { readOrderAccess } from "@/lib/payments/access";
import { createPreferenceLimiter, credentialShape } from "@/lib/payments/checkout-policy";
import { readAppOrigin, startCheckout } from "@/lib/payments/checkout-service";
import { paymentAccessToken, paymentRuntime } from "@/lib/payments/mercadopago";
import { compositionChecked, pieceComposes } from "@/lib/print/layout";
import { STUDIO_COMMERCIAL_ARTWORK_VERSION } from "@/lib/studio/commercial-artwork";
import { studioSalesOpen } from "@/lib/studio/checkout-access";
import { readJsonBody } from "@/lib/http/body";
import { standbyHost } from "@/lib/standby-host";
import { logWarn } from "@/lib/log";
import { ROUTE_LIMITS, consumeBuckets, ipBucket, rateLimitedResponse } from "@/lib/rate-limit/policies";
import { studioClientKeyFromRequest, studioRequestTrusted } from "@/lib/studio/draft-session";
import { sharedRateLimiter } from "@/lib/studio/rate-limits";

const limiter = createPreferenceLimiter();

export async function POST(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  // The standby host (Render) starts no payments; the service is on the VPS.
  if (standbyHost()) return paymentError(503, "standby-host");
  const { publicId } = await context.params;
  if (!studioRequestTrusted(request)) return paymentError(403, "origin-rejected");
  const body = await readJsonBody(request, 2000);
  if (body === undefined) return paymentError(400, "invalid-body");

  const limited = await consumeBuckets(sharedRateLimiter(), [
    ipBucket("checkout", studioClientKeyFromRequest(request), ROUTE_LIMITS.checkoutIp),
  ]);
  if (!limited.ok) return rateLimitedResponse(limited);

  if (credentialShape(paymentAccessToken()) === "mismatch") {
    logWarn("payment.checkout.credential-mismatch");
  }

  try {
    const stored = await findOrder(publicId);
    // Studio v8 uses the same preference flow as v1–v7 when STUDIO_CHECKOUT_ENABLED is on.
    // When off, refuse new checkout links; already-PAID delivery ignores this gate.
    if (stored?.artwork.version === STUDIO_COMMERCIAL_ARTWORK_VERSION) {
      if (!studioSalesOpen()) return paymentError(409, "checkout-unavailable");
    } else if (
      stored?.artwork &&
      compositionChecked(stored.artwork) &&
      !pieceComposes(stored.artwork)
    ) {
      return paymentError(409, "composition-invalid");
    }
  } catch (error) {
    if (isDatabaseUnavailable(error)) return paymentError(503, "database-unavailable");
    throw error;
  }

  const runtime = await paymentRuntime();
  const result = await startCheckout({
    publicId,
    body,
    deliveryKey: readOrderAccess(request.headers.get("cookie"), publicId),
    accessToken: runtime.token,
    origin: readAppOrigin(),
    gateway: runtime.gateway,
    limiter,
    store: { find: findPaymentRecord, savePreference: savePreferenceId },
    owner: runtime.owner,
  });

  if (!result.ok) return paymentError(result.status, result.error);

  return Response.json(
    { initPoint: result.initPoint },
    { headers: { "cache-control": "no-store" } },
  );
}

function paymentError(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}
