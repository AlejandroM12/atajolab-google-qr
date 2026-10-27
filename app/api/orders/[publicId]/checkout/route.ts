import { readOrderAccess } from "@/lib/payments/access";
import { createPreferenceLimiter, sandboxCredentialState } from "@/lib/payments/checkout-policy";
import { readAppOrigin, startCheckout } from "@/lib/payments/checkout-service";
import { gatewayForRequest, paymentAccessToken } from "@/lib/payments/mercadopago";
import { findPaymentRecord, savePreferenceId } from "@/lib/orders";

const limiter = createPreferenceLimiter();

export async function POST(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await context.params;
  const body = await readBody(request);
  if (body === undefined) return paymentError(400, "invalid-body");

  if (sandboxCredentialState(paymentAccessToken()) === "production") {
    console.error("checkout refused production-token");
  }

  const result = await startCheckout({
    publicId,
    body,
    deliveryKey: readOrderAccess(request.headers.get("cookie"), publicId),
    accessToken: paymentAccessToken(),
    origin: readAppOrigin(),
    gateway: gatewayForRequest(),
    limiter,
    store: { find: findPaymentRecord, savePreference: savePreferenceId },
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
