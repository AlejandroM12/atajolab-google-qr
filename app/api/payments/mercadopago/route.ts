import { applyVerifiedPayment, findPaymentRecord } from "@/lib/orders";
import { processPaymentNotification } from "@/lib/payments/webhook-handler";
import { notificationIsAuthentic } from "@/lib/payments/webhook-auth";
import { gatewayForRequest, paymentAccessToken, paymentWebhookSecret } from "@/lib/payments/mercadopago";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const dataId = url.searchParams.get("data.id");
  const topic = url.searchParams.get("type") ?? url.searchParams.get("topic");
  const authentic = notificationIsAuthentic({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId,
    secret: paymentWebhookSecret(),
  });

  const status = await processPaymentNotification({
    authentic,
    topic,
    dataId,
    accessToken: paymentAccessToken(),
    gateway: gatewayForRequest(),
    findOrder: findPaymentRecord,
    apply: applyVerifiedPayment,
  });

  if (status === 500) {
    console.error("mercadopago webhook retry");
  }

  return new Response(null, { status, headers: { "cache-control": "no-store" } });
}
