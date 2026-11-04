import {
  MercadoPagoConfig,
  Payment,
  Preference,
  MPConnectionError,
  MPDependencyError,
  MPRateLimitError,
  MPResourceLockedError,
  MPServerError,
} from "mercadopago";
import { PIECE_CURRENCY, PIECE_PRICE_ARS } from "@/lib/pricing";
import {
  MAX_RECONCILE_PAYMENTS,
  credentialShape,
  isMercadoPagoCheckoutUrl,
  preferenceAutoReturn,
  publicNotificationUrl,
} from "@/lib/payments/checkout-policy";
import type { VerifiedPayment } from "@/lib/payments/decision";
import {
  classifyAccount,
  classifyParties,
  classifyProductionParties,
  type MercadoPagoAccount,
  type PaymentParties,
} from "@/lib/payments/test-accounts";

export class PaymentProviderError extends Error {
  constructor() {
    super("payment-provider");
    this.name = "PaymentProviderError";
  }
}

export type CheckoutPreference = {
  id: string;
  initPoint: string;
  externalReference: string;
  amount: number;
  currency: string;
};

export type PaymentGateway = {
  createPreference(input: {
    publicId: string;
    title: string;
    successUrl: string;
    pendingUrl: string;
    failureUrl: string;
  }): Promise<CheckoutPreference>;
  getPreference(id: string): Promise<CheckoutPreference | null>;
  getPayment(id: string): Promise<VerifiedPayment | null>;
  findPayments(publicId: string): Promise<VerifiedPayment[]>;
};

function temporary(error: unknown): boolean {
  return (
    error instanceof MPConnectionError ||
    error instanceof MPServerError ||
    error instanceof MPRateLimitError ||
    error instanceof MPDependencyError ||
    error instanceof MPResourceLockedError ||
    (error instanceof Error && error.name === "PaymentProviderError")
  );
}

function asPreference(value: {
  id?: string;
  init_point?: string;
  external_reference?: string;
  items?: Array<{ unit_price: number; currency_id?: string }>;
}): CheckoutPreference | null {
  const item = value.items?.[0];

  if (!value.id || !value.init_point || !item || !isMercadoPagoCheckoutUrl(value.init_point)) {
    return null;
  }

  return {
    id: value.id,
    initPoint: value.init_point,
    externalReference: value.external_reference ?? "",
    amount: item.unit_price,
    currency: item.currency_id ?? "",
  };
}

export type PaymentIdentity = {
  id?: number | string;
  status?: string;
  transaction_amount?: number;
  currency_id?: string;
  external_reference?: string;
  live_mode?: boolean;
  date_approved?: string;
  collector_id?: number | string | null;
  payer?: { id?: number | string | null; email?: string | null } | null;
};

const ACCOUNT_ID = /^\d{1,20}$/;

function accountId(value: number | string | null | undefined): string | null {
  const id = value === undefined || value === null ? "" : String(value);
  return ACCOUNT_ID.test(id) ? id : null;
}

function asPayment(value: PaymentIdentity): VerifiedPayment | null {
  if (
    value.id === undefined ||
    value.id === "" ||
    !value.status ||
    value.transaction_amount === undefined ||
    !value.currency_id
  ) {
    return null;
  }

  return {
    id: String(value.id),
    status: value.status,
    amount: value.transaction_amount,
    currency: value.currency_id,
    externalReference: value.external_reference ?? "",
    liveMode: value.live_mode ?? null,
    approvedAt: value.date_approved ?? null,
    parties: "unverified",
    collectorId: null,
    accountId: null,
  };
}

export function parseMercadoPagoUser(
  body: unknown,
): { id: string; account: MercadoPagoAccount } | null {
  if (body === null || typeof body !== "object") return null;
  const record = body as {
    id?: unknown;
    email?: unknown;
    tags?: unknown;
    nickname?: unknown;
    test_data?: unknown;
  };
  const id = record.id === undefined || record.id === null ? "" : String(record.id);
  if (!ACCOUNT_ID.test(id)) return null;

  const testData =
    record.test_data !== null && typeof record.test_data === "object"
      ? (record.test_data as { test_user?: unknown })
      : null;

  return {
    id,
    account: {
      email: typeof record.email === "string" ? record.email : null,
      tags: Array.isArray(record.tags)
        ? record.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      nickname: typeof record.nickname === "string" ? record.nickname : null,
      testUserFlag: testData?.test_user === true,
    },
  };
}

export async function readTokenOwner(
  accessToken: string,
): Promise<{ id: string; account: MercadoPagoAccount } | null> {
  let response: Response;
  try {
    response = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new PaymentProviderError();
  }

  if (response.status === 401 || response.status === 403 || response.status === 404) return null;
  if (!response.ok) throw new PaymentProviderError();

  return parseMercadoPagoUser(await response.json());
}

async function readAccount(
  accessToken: string,
  userId: number | string | null | undefined,
): Promise<MercadoPagoAccount | null> {
  const id = userId === undefined || userId === null ? "" : String(userId);
  if (!ACCOUNT_ID.test(id)) return null;

  let response: Response;
  try {
    response = await fetch(`https://api.mercadopago.com/users/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new PaymentProviderError();
  }

  if (response.status === 401 || response.status === 403 || response.status === 404) return null;
  if (!response.ok) throw new PaymentProviderError();

  const parsed = parseMercadoPagoUser(await response.json());
  if (!parsed || parsed.id !== id) return null;
  return parsed.account;
}

export async function paymentParties(
  accessToken: string,
  payment: PaymentIdentity,
  environment: string | undefined,
  lookup: typeof readAccount = readAccount,
): Promise<PaymentParties> {
  const payerEmail = typeof payment.payer?.email === "string" ? payment.payer.email : null;

  if (environment === "production") {
    // The seller is proven by collector_id === token owner (checked in decidePayment).
    // The buyer profile is only read to reject test users. A guest buyer has no id
    // and a real profile is usually private, so a missing or failed lookup is fine.
    let payer: MercadoPagoAccount | null = null;
    try {
      payer = await lookup(accessToken, payment.payer?.id);
    } catch {
      payer = null;
    }
    return classifyProductionParties(payer, payerEmail);
  }

  const [payer, collector] = await Promise.all([
    lookup(accessToken, payment.payer?.id),
    lookup(accessToken, payment.collector_id),
  ]);

  // The buyer profile hides email and tags. The linked email comes from this
  // payment resource, fetched with the server token, never from the webhook body.
  return classifyParties(classifyAccount(payer, payerEmail), classifyAccount(collector));
}

export function createMercadoPagoGateway(env: {
  accessToken: string | undefined;
  notificationUrl: string | undefined;
  collectorId: string;
  environment?: string;
}): PaymentGateway {
  const accessToken = env.accessToken?.trim() ?? "";
  const collectorId = env.collectorId.trim();
  const environment = env.environment;

  if (credentialShape(accessToken, env.environment) !== "ready" || !ACCOUNT_ID.test(collectorId)) {
    throw new PaymentProviderError();
  }

  const client = new MercadoPagoConfig({
    accessToken,
    options: { timeout: 8000 },
  });
  const preferences = new Preference(client);
  const payments = new Payment(client);
  const notificationUrl = publicNotificationUrl(env.notificationUrl);

  return {
    async createPreference(input) {
      try {
        const autoReturn = preferenceAutoReturn(input.successUrl);
        const response = await preferences.create({
          body: {
            items: [
              {
                id: "pieza-qr",
                title: input.title,
                quantity: 1,
                unit_price: PIECE_PRICE_ARS,
                currency_id: PIECE_CURRENCY,
              },
            ],
            external_reference: input.publicId,
            notification_url: notificationUrl ?? undefined,
            ...(autoReturn ? { auto_return: autoReturn } : {}),
            statement_descriptor: "ATAJOLAB",
            back_urls: {
              success: input.successUrl,
              pending: input.pendingUrl,
              failure: input.failureUrl,
            },
          },
          requestOptions: { idempotencyKey: `preference-${input.publicId}` },
        });
        const preference = asPreference(response);

        if (!preference || preference.externalReference !== input.publicId) {
          throw new PaymentProviderError();
        }

        return preference;
      } catch (error) {
        if (error instanceof PaymentProviderError || temporary(error)) {
          throw new PaymentProviderError();
        }

        throw new PaymentProviderError();
      }
    },

    async getPreference(id) {
      try {
        return asPreference(await preferences.get({ preferenceId: id }));
      } catch (error) {
        if (error instanceof Error && error.name === "MPNotFoundError") {
          return null;
        }

        throw new PaymentProviderError();
      }
    },

    async getPayment(id) {
      try {
        const response = await payments.get({ id });
        const payment = asPayment(response);
        if (!payment) return null;
        payment.collectorId = accountId(response.collector_id);
        payment.accountId = collectorId;
        payment.parties = await paymentParties(accessToken, response, environment);
        return payment;
      } catch (error) {
        if (error instanceof PaymentProviderError) throw error;
        if (error instanceof Error && error.name === "MPNotFoundError") {
          return null;
        }

        throw new PaymentProviderError();
      }
    },

    async findPayments(publicId) {
      try {
        const response = await payments.search({
          options: {
            external_reference: publicId,
            limit: MAX_RECONCILE_PAYMENTS,
            sort: "date_created",
            criteria: "desc",
          },
        });
        const verified: VerifiedPayment[] = [];

        for (const payment of (response.results ?? []).slice(0, MAX_RECONCILE_PAYMENTS)) {
          const mapped = asPayment(payment);
          if (!mapped) continue;
          mapped.collectorId = accountId(payment.collector_id);
          mapped.accountId = collectorId;
          mapped.parties = await paymentParties(accessToken, payment, environment);
          verified.push(mapped);
        }

        return verified;
      } catch (error) {
        if (error instanceof PaymentProviderError) throw error;
        throw new PaymentProviderError();
      }
    },
  };
}
