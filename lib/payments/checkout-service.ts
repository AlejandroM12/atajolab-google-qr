import { isDatabaseUnavailable } from "@/lib/db-error";
import type { PaymentRecord } from "@/lib/orders";
import { PIECE_CURRENCY } from "@/lib/pricing";
import { isPublicId } from "@/lib/public-id";
import { deliveryKeysMatch } from "@/lib/payments/access";
import {
  amountsMatch,
  appOrigin,
  credentialOwnerMatches,
  credentialShape,
  isMercadoPagoCheckoutUrl,
  MAX_RECONCILE_PAYMENTS,
  parseCheckoutBody,
  parsePaymentHint,
  paymentEnvironmentMode,
  priceIsCatalog,
  type CheckoutBodyError,
} from "@/lib/payments/checkout-policy";
import { decidePayment, type PaymentEnvironment, type VerifiedPayment } from "@/lib/payments/decision";
import type { CheckoutPreference, PaymentGateway } from "@/lib/payments/gateway";
import type { AccountKind } from "@/lib/payments/test-accounts";

const CHECKOUT_TITLE = "Pieza digital con QR";

export type CheckoutResponse =
  | { ok: true; initPoint: string }
  | { ok: false; status: number; error: string };

export type ReconcileResponse =
  | { ok: true; status: PaymentRecord["status"] }
  | { ok: false; status: number; error: string };

type Limiter = { allow(publicId: string): boolean };

type PaymentStore = {
  find(publicId: string): Promise<PaymentRecord | null>;
  savePreference(publicId: string, preferenceId: string): Promise<void>;
  apply(publicId: string, payment: VerifiedPayment, checkedAt: Date): Promise<void>;
};

function preferenceMatches(preference: CheckoutPreference, order: PaymentRecord): boolean {
  return (
    preference.externalReference === order.publicId &&
    preference.currency === PIECE_CURRENCY &&
    amountsMatch(preference.amount, order.amountArs) &&
    priceIsCatalog(order.amountArs, order.currency) &&
    isMercadoPagoCheckoutUrl(preference.initPoint)
  );
}

function returnUrl(origin: URL, publicId: string, retorno: "aprobado" | "pendiente" | "rechazado"): string {
  const url = new URL(`/pedido/${publicId}`, origin);
  url.searchParams.set("retorno", retorno);
  return url.href;
}

function failure(status: number, error: string): CheckoutResponse {
  return { ok: false, status, error };
}

export async function startCheckout(input: {
  publicId: string;
  body: unknown;
  deliveryKey: string | null;
  accessToken: string | undefined;
  origin: URL | null;
  gateway: PaymentGateway;
  limiter: Limiter;
  store: Pick<PaymentStore, "find" | "savePreference">;
  environment?: string;
  owner?: AccountKind | null;
}): Promise<CheckoutResponse> {
  const bodyError = parseCheckoutBody(input.body);
  if (bodyError) return failure(400, bodyError);
  if (!isPublicId(input.publicId)) return failure(404, "not-found");
  if (!input.origin) return failure(503, "payments-not-configured");

  const environment = input.environment ?? process.env.MERCADOPAGO_ENV;
  if (credentialShape(input.accessToken, environment) !== "ready") {
    return failure(503, "payments-not-configured");
  }
  if (input.owner !== undefined && !credentialOwnerMatches(environment, input.owner)) {
    return failure(503, "payments-not-configured");
  }

  const order = await input.store.find(input.publicId);
  if (!order) return failure(404, "not-found");
  if (order.status !== "PENDING") return failure(409, "order-not-pending");
  if (!priceIsCatalog(order.amountArs, order.currency)) return failure(409, "order-price");
  if (!deliveryKeysMatch(input.deliveryKey ?? "", order.deliveryKeyHash)) {
    return failure(403, "checkout-unauthorized");
  }

  if (order.preferenceId) {
    try {
      const existing = await input.gateway.getPreference(order.preferenceId);
      if (existing && preferenceMatches(existing, order)) {
        return { ok: true, initPoint: existing.initPoint };
      }
    } catch {
      return failure(503, "payment-provider");
    }
  }

  if (!input.limiter.allow(order.publicId)) return failure(429, "preference-limit");

  let preference: CheckoutPreference;
  try {
    preference = await input.gateway.createPreference({
      publicId: order.publicId,
      title: CHECKOUT_TITLE,
      successUrl: returnUrl(input.origin, order.publicId, "aprobado"),
      pendingUrl: returnUrl(input.origin, order.publicId, "pendiente"),
      failureUrl: returnUrl(input.origin, order.publicId, "rechazado"),
    });
  } catch {
    return failure(503, "payment-provider");
  }

  if (!preferenceMatches(preference, order)) return failure(502, "payment-provider");

  try {
    await input.store.savePreference(order.publicId, preference.id);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return failure(503, "database-unavailable");
    return failure(500, "order-failed");
  }

  return { ok: true, initPoint: preference.initPoint };
}

export async function reconcilePayment(input: {
  publicId: string;
  body: unknown;
  deliveryKey: string | null;
  accessToken: string | undefined;
  gateway: PaymentGateway;
  store: Pick<PaymentStore, "find" | "apply">;
  environment?: PaymentEnvironment;
  now?: Date;
}): Promise<ReconcileResponse> {
  const parsed = parsePaymentHint(input.body);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error satisfies CheckoutBodyError };
  if (!isPublicId(input.publicId)) return { ok: false, status: 404, error: "not-found" };

  const order = await input.store.find(input.publicId);
  if (!order) return { ok: false, status: 404, error: "not-found" };
  if (!deliveryKeysMatch(input.deliveryKey ?? "", order.deliveryKeyHash)) {
    return { ok: false, status: 403, error: "checkout-unauthorized" };
  }
  if (order.status !== "PENDING") return { ok: true, status: order.status };
  const environment = input.environment ?? process.env.MERCADOPAGO_ENV;
  if (credentialShape(input.accessToken, environment) !== "ready") {
    return { ok: false, status: 503, error: "payments-not-configured" };
  }

  const checkedAt = input.now ?? new Date();
  const payments: VerifiedPayment[] = [];

  try {
    if (parsed.paymentId) {
      const hinted = await input.gateway.getPayment(parsed.paymentId);
      if (hinted) payments.push(hinted);
    }
    payments.push(...(await input.gateway.findPayments(order.publicId)));
  } catch {
    return { ok: false, status: 503, error: "payment-provider" };
  }

  const seen = new Set<string>();
  for (const payment of payments) {
    if (seen.has(payment.id)) continue;
    if (seen.size >= MAX_RECONCILE_PAYMENTS) break;
    seen.add(payment.id);
    const decision = decidePayment(
      order,
      payment,
      checkedAt,
      input.environment ?? paymentEnvironmentMode(),
    );
    if (decision.action === "ignore") continue;
    try {
      await input.store.apply(order.publicId, payment, checkedAt);
    } catch (error) {
      if (isDatabaseUnavailable(error)) return { ok: false, status: 503, error: "database-unavailable" };
      return { ok: false, status: 500, error: "order-failed" };
    }
    if (decision.action === "mark-paid") {
      const updated = await input.store.find(order.publicId);
      return { ok: true, status: updated?.status ?? "PENDING" };
    }
  }

  return { ok: true, status: "PENDING" };
}

export function readAppOrigin(): URL | null {
  return appOrigin(process.env.APP_URL);
}
