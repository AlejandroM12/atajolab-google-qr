import { logError, logInfo } from "@/lib/log";
import type { PaymentUpdate, VerifiedPayment } from "@/lib/payments/decision";

/**
 * An approved payment that is not applied means money was received without
 * delivery. Log it as an error (alert) unless the order was already closed.
 * Fields are ids and reasons only, never buyer data.
 */
export function reportIgnoredPayment(
  source: "webhook" | "reconcile",
  publicId: string,
  payment: VerifiedPayment,
  decision: Extract<PaymentUpdate, { action: "ignore" }>,
): void {
  const fields = {
    source,
    publicId,
    paymentId: payment.id,
    paymentStatus: payment.status,
    reason: decision.reason,
    liveMode: payment.liveMode ?? null,
    parties: payment.parties,
  };
  if (payment.status === "approved" && decision.reason !== "order-closed") {
    logError("payment.approved-but-ignored", undefined, fields);
    return;
  }
  logInfo("payment.ignored", fields);
}
