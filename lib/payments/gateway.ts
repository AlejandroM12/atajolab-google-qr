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
  isMercadoPagoCheckoutUrl,
  preferenceAutoReturn,
  publicNotificationUrl,
  sandboxCredentialState,
} from "@/lib/payments/checkout-policy";
import type { VerifiedPayment } from "@/lib/payments/decision";
import {
  classifyAccount,
  classifyParties,
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

type PaymentIdentity = {
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
  };
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

  const body = (await response.json()) as {
    id?: unknown;
    email?: unknown;
    tags?: unknown;
    nickname?: unknown;
    test_data?: unknown;
  };
  if (body.id === undefined || String(body.id) !== id) return null;

  const testData =
    body.test_data !== null && typeof body.test_data === "object"
      ? (body.test_data as { test_user?: unknown })
      : null;

  return {
    email: typeof body.email === "string" ? body.email : null,
    tags: Array.isArray(body.tags) ? body.tags.filter((tag): tag is string => typeof tag === "string") : [],
    nickname: typeof body.nickname === "string" ? body.nickname : null,
    testUserFlag: testData?.test_user === true,
  };
}

async function paymentParties(accessToken: string, payment: PaymentIdentity): Promise<PaymentParties> {
  const [payer, collector] = await Promise.all([
    readAccount(accessToken, payment.payer?.id),
    readAccount(accessToken, payment.collector_id),
  ]);
  const payerEmail = typeof payment.payer?.email === "string" ? payment.payer.email : null;

  // The buyer profile hides email and tags. The linked email comes from this
  // payment resource, fetched with the server token, never from the webhook body.
  return classifyParties(classifyAccount(payer, payerEmail), classifyAccount(collector));
}

export function createMercadoPagoGateway(env: {
  accessToken: string | undefined;
  notificationUrl: string | undefined;
}): PaymentGateway {
  const accessToken = env.accessToken?.trim() ?? "";

  if (sandboxCredentialState(accessToken) !== "ready") {
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
        payment.parties = await paymentParties(accessToken, response);
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
          options: { external_reference: publicId },
        });
        const verified: VerifiedPayment[] = [];

        for (const payment of response.results ?? []) {
          const mapped = asPayment(payment);
          if (!mapped) continue;
          mapped.parties = await paymentParties(accessToken, payment);
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
