import { isDatabaseUnavailable } from "@/lib/db-error";
import { findOrder, findPaymentRecord, savePreferenceId } from "@/lib/orders";
import { readOrderAccess } from "@/lib/payments/access";
import { createPreferenceLimiter, credentialShape } from "@/lib/payments/checkout-policy";
import { readAppOrigin, startCheckout } from "@/lib/payments/checkout-service";
import { paymentAccessToken, paymentRuntime } from "@/lib/payments/mercadopago";
import { compositionChecked, pieceComposes } from "@/lib/print/layout";
import { STUDIO_COMMERCIAL_ARTWORK_VERSION } from "@/lib/studio/commercial-artwork";

const limiter = createPreferenceLimiter();

export async function POST(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await context.params;
  const body = await readBody(request);
  if (body === undefined) return paymentError(400, "invalid-body");

  if (credentialShape(paymentAccessToken()) === "mismatch") {
    console.error("checkout refused credentials");
  }

  try {
    const stored = await findOrder(publicId);
    // Studio v8 checkout ships later — keep Mercado Pago preference flow on v1–v7 only.
    if (stored?.artwork.version === STUDIO_COMMERCIAL_ARTWORK_VERSION) {
      return paymentError(409, "checkout-unavailable");
    }
    if (
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

async function readBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) return undefined;

  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return undefined;
  }
  if (raw.length > 2000) return undefined;

  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function paymentError(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}
