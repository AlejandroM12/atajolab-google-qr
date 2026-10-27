import { isDatabaseUnavailable } from "@/lib/db-error";
import type { PaymentRecord } from "@/lib/orders";
import { isPublicId } from "@/lib/public-id";
import { paymentEnvironmentMode, sandboxCredentialState } from "@/lib/payments/checkout-policy";
import { decidePayment, type PaymentEnvironment, type VerifiedPayment } from "@/lib/payments/decision";
import type { PaymentGateway } from "@/lib/payments/gateway";

function uniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function processPaymentNotification(input: {
  authentic: boolean;
  topic: string | null;
  dataId: string | null;
  accessToken: string | undefined;
  gateway: PaymentGateway;
  findOrder: (publicId: string) => Promise<PaymentRecord | null>;
  apply: (publicId: string, payment: VerifiedPayment, checkedAt: Date) => Promise<void>;
  environment?: PaymentEnvironment;
  now?: Date;
}): Promise<number> {
  if (!input.authentic) return 401;
  if (input.topic && input.topic !== "payment") return 200;
  if (!input.dataId || !/^\d{1,32}$/.test(input.dataId)) return 200;
  if (sandboxCredentialState(input.accessToken) !== "ready") return 500;

  let payment: VerifiedPayment | null;
  try {
    payment = await input.gateway.getPayment(input.dataId);
  } catch (error) {
    console.error("payment lookup failed", error instanceof Error ? error.name : "unknown");
    return 500;
  }
  if (!payment || !isPublicId(payment.externalReference)) return 200;

  const order = await input.findOrder(payment.externalReference);
  if (!order) return 200;

  const decision = decidePayment(
    order,
    payment,
    input.now ?? new Date(),
    input.environment ?? paymentEnvironmentMode(),
  );
  if (decision.action === "ignore") return 200;

  try {
    await input.apply(order.publicId, payment, input.now ?? new Date());
  } catch (error) {
    console.error("payment update failed", error instanceof Error ? error.name : "unknown");
    if (uniqueConflict(error)) return 200;
    if (isDatabaseUnavailable(error)) return 500;
    return 500;
  }

  return 200;
}
