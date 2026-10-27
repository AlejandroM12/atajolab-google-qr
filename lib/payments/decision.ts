import { PIECE_CURRENCY } from "@/lib/pricing";
import { isPublicId } from "@/lib/public-id";
import { amountsMatch, priceIsCatalog } from "@/lib/payments/checkout-policy";
import type { PaymentParties } from "@/lib/payments/test-accounts";

export type PaymentEnvironment = "test" | "production";

export type VerifiedPayment = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  externalReference: string;
  liveMode: boolean | null;
  approvedAt: string | null;
  parties: PaymentParties;
};

export type PaymentOrderSnapshot = {
  publicId: string;
  status: "PENDING" | "PAID" | "CANCELLED";
  amountArs: number;
  currency: string;
  paymentId: string | null;
};

export type PaymentUpdate =
  | {
      action: "mark-paid";
      paymentId: string;
      paymentStatus: "approved";
      paidAt: Date;
    }
  | {
      action: "record-external";
      paymentId: string;
      paymentStatus: string;
    }
  | {
      action: "ignore";
      reason: string;
    };

export function decidePayment(
  order: PaymentOrderSnapshot,
  payment: VerifiedPayment,
  checkedAt: Date,
  environment: PaymentEnvironment = "production",
): PaymentUpdate {
  if (!isPublicId(payment.externalReference) || payment.externalReference !== order.publicId) {
    return { action: "ignore", reason: "reference-mismatch" };
  }

  if (payment.currency !== PIECE_CURRENCY || payment.currency !== order.currency) {
    return { action: "ignore", reason: "currency-mismatch" };
  }

  if (
    !priceIsCatalog(order.amountArs, order.currency) ||
    !amountsMatch(payment.amount, order.amountArs)
  ) {
    return { action: "ignore", reason: "amount-mismatch" };
  }

  if (!acceptedPayment(payment, environment)) {
    return { action: "ignore", reason: "unverified-parties" };
  }

  if (order.status === "PAID" || order.status === "CANCELLED") {
    return { action: "ignore", reason: "order-closed" };
  }

  if (payment.status !== "approved") {
    return {
      action: "record-external",
      paymentId: payment.id,
      paymentStatus: payment.status,
    };
  }

  return {
    action: "mark-paid",
    paymentId: payment.id,
    paymentStatus: "approved",
    paidAt: payment.approvedAt ? new Date(payment.approvedAt) : checkedAt,
  };
}

function acceptedPayment(payment: VerifiedPayment, environment: PaymentEnvironment): boolean {
  if (environment === "test") {
    return payment.parties === "verified-test-users";
  }

  return payment.parties === "verified-real" && payment.liveMode === true;
}
