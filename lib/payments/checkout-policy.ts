import { PIECE_CURRENCY, PIECE_PRICE_ARS } from "@/lib/pricing";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_ORDER = 3;
const MAX_GLOBAL = 30;
const RECONCILE_PER_ORDER = 6;
const RECONCILE_GLOBAL = 60;

/** Payments classified on one reconciliation. Newer search results come first. */
export const MAX_RECONCILE_PAYMENTS = 8;

export type CheckoutBodyError = "invalid-body" | "unexpected-field";

export function parseCheckoutBody(body: unknown): CheckoutBodyError | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return "invalid-body";
  }

  return Object.keys(body).length === 0 ? null : "unexpected-field";
}

export function parsePaymentHint(body: unknown):
  | { ok: true; paymentId: string | null }
  | { ok: false; error: CheckoutBodyError } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid-body" };
  }

  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);

  if (keys.length === 0) {
    return { ok: true, paymentId: null };
  }

  if (keys.length !== 1 || keys[0] !== "paymentId" || typeof record.paymentId !== "string") {
    return { ok: false, error: "unexpected-field" };
  }

  if (!/^\d{1,32}$/.test(record.paymentId)) {
    return { ok: false, error: "unexpected-field" };
  }

  return { ok: true, paymentId: record.paymentId };
}

export function paymentEnvironmentMode(
  environment: string | undefined = process.env.MERCADOPAGO_ENV,
): "test" | "production" {
  return environment?.trim().toLowerCase() === "test" ? "test" : "production";
}

/**
 * The APP_USR- prefix is shared by test and production Checkout Pro tokens.
 * This check only rejects shapes that cannot belong to the selected mode.
 * The account behind the token is verified with GET /users/me before a preference is created.
 */
export function credentialShape(
  accessToken: string | undefined,
  environment: string | undefined = process.env.MERCADOPAGO_ENV,
): "ready" | "missing" | "mismatch" {
  const token = accessToken?.trim() ?? "";
  const mode = environment?.trim().toLowerCase() ?? "";

  if (!token) return "missing";
  if (mode === "production" || mode === "live") {
    return token.startsWith("APP_USR-") ? "ready" : "mismatch";
  }
  if (token.startsWith("TEST-")) return "ready";
  if (token.startsWith("APP_USR-") && mode === "test") return "ready";

  return "mismatch";
}

export function credentialOwnerMatches(
  environment: string | undefined,
  owner: "test-user" | "real" | "unverified" | null,
): boolean {
  const mode = environment?.trim().toLowerCase() ?? "";
  if (mode === "production" || mode === "live") return owner === "real";
  if (mode === "test") return owner === "test-user";
  return false;
}

export function isMercadoPagoCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      /^(?:[\w-]+\.)*mercadopago\.com(?:\.[a-z]{2})?$/.test(url.hostname)
    );
  } catch {
    return false;
  }
}

export function amountsMatch(paymentAmount: number, orderAmountArs: number): boolean {
  if (!Number.isFinite(paymentAmount) || !Number.isInteger(orderAmountArs)) {
    return false;
  }

  return Math.round(paymentAmount * 100) === orderAmountArs * 100;
}

export function priceIsCatalog(amountArs: number, currency: string): boolean {
  return amountArs === PIECE_PRICE_ARS && currency === PIECE_CURRENCY;
}

export type ReturnHint = "aprobado" | "pendiente" | "rechazado";

export function parseReturnHint(value: string | undefined): ReturnHint | null {
  if (value === "aprobado" || value === "pendiente" || value === "rechazado") {
    return value;
  }

  return null;
}

export type PaymentView =
  | "pending"
  | "verifying"
  | "approved"
  | "rejected"
  | "cancelled";

export function paymentView(input: {
  orderStatus: "PENDING" | "PAID" | "CANCELLED" | "FREE";
  hint: ReturnHint | null;
  externalStatus: string | null;
}): PaymentView {
  if (input.orderStatus === "PAID" || input.orderStatus === "FREE") {
    return "approved";
  }

  if (input.orderStatus === "CANCELLED") {
    return "cancelled";
  }

  if (
    input.externalStatus === "rejected" ||
    input.externalStatus === "cancelled" ||
    input.hint === "rechazado"
  ) {
    return "rejected";
  }

  if (
    input.hint === "aprobado" ||
    input.hint === "pendiente" ||
    input.externalStatus === "pending" ||
    input.externalStatus === "in_process" ||
    input.externalStatus === "authorized"
  ) {
    return "verifying";
  }

  return "pending";
}

export function createPreferenceLimiter(now: () => number = Date.now) {
  const byOrder = new Map<string, number[]>();
  const globalHits: number[] = [];

  return {
    allow(publicId: string): boolean {
      const moment = now();
      const recentGlobal = globalHits.filter((hit) => moment - hit < WINDOW_MS);
      globalHits.splice(0, globalHits.length, ...recentGlobal);

      const recent = (byOrder.get(publicId) ?? []).filter((hit) => moment - hit < WINDOW_MS);

      if (recent.length >= MAX_PER_ORDER || recentGlobal.length >= MAX_GLOBAL) {
        byOrder.set(publicId, recent);
        return false;
      }

      recent.push(moment);
      globalHits.push(moment);
      byOrder.set(publicId, recent);
      return true;
    },
  };
}

export function createReconcileLimiter(now: () => number = Date.now) {
  const byOrder = new Map<string, number[]>();
  const globalHits: number[] = [];

  return {
    allow(publicId: string): boolean {
      const moment = now();
      const recentGlobal = globalHits.filter((hit) => moment - hit < WINDOW_MS);
      globalHits.splice(0, globalHits.length, ...recentGlobal);

      const recent = (byOrder.get(publicId) ?? []).filter((hit) => moment - hit < WINDOW_MS);

      if (recent.length >= RECONCILE_PER_ORDER || recentGlobal.length >= RECONCILE_GLOBAL) {
        byOrder.set(publicId, recent);
        return false;
      }

      recent.push(moment);
      globalHits.push(moment);
      byOrder.set(publicId, recent);
      return true;
    },
  };
}

export function preferenceAutoReturn(successUrl: string): "approved" | undefined {
  try {
    return new URL(successUrl).protocol === "https:" ? "approved" : undefined;
  } catch {
    return undefined;
  }
}

export function publicNotificationUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function appOrigin(value: string | undefined): URL | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}
