import { applyVerifiedPayment, findPaymentRecord } from "@/lib/orders";
import { logError, logWarn } from "@/lib/log";
import { processPaymentNotification } from "@/lib/payments/webhook-handler";
import { notificationIsAuthentic } from "@/lib/payments/webhook-auth";
import { paymentRuntime, paymentWebhookSecret } from "@/lib/payments/mercadopago";

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

  if (!authentic) {
    // Unsigned or forged: answer before touching Mercado Pago or the database.
    logWarn("payment.webhook.unauthentic", { topic: topic ?? "" });
    return new Response(null, { status: 401, headers: { "cache-control": "no-store" } });
  }

  const runtime = await paymentRuntime();
  const status = await processPaymentNotification({
    authentic,
    topic,
    dataId,
    accessToken: runtime.token,
    gateway: runtime.gateway,
    findOrder: findPaymentRecord,
    apply: applyVerifiedPayment,
  });

  if (status === 500) {
    logError("payment.webhook.retry", undefined, { topic: topic ?? "" });
  }

  return new Response(null, { status, headers: { "cache-control": "no-store" } });
}
