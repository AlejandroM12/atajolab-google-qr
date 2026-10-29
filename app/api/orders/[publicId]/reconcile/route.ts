import { readOrderAccess } from "@/lib/payments/access";
import { reconcilePayment } from "@/lib/payments/checkout-service";
import { paymentRuntime } from "@/lib/payments/mercadopago";
import { applyVerifiedPayment, findPaymentRecord } from "@/lib/orders";

export async function POST(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await context.params;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return paymentError(400, "invalid-body");
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 2000) return paymentError(400, "invalid-body");
    body = JSON.parse(raw);
  } catch {
    return paymentError(400, "invalid-body");
  }

  const runtime = await paymentRuntime();
  const result = await reconcilePayment({
    publicId,
    body,
    deliveryKey: readOrderAccess(request.headers.get("cookie"), publicId),
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
