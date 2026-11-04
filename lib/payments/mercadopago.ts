import { createHash } from "node:crypto";
import { logError, logWarn } from "@/lib/log";
import { credentialOwnerMatches, credentialShape } from "@/lib/payments/checkout-policy";
import {
  PaymentProviderError,
  createMercadoPagoGateway,
  readTokenOwner,
  type PaymentGateway,
} from "@/lib/payments/gateway";
import { classifyAccount, type AccountKind } from "@/lib/payments/test-accounts";

const idleGateway: PaymentGateway = {
  async createPreference() {
    throw new PaymentProviderError();
  },
  async getPreference() {
    throw new PaymentProviderError();
  },
  async getPayment() {
    throw new PaymentProviderError();
  },
  async findPayments() {
    throw new PaymentProviderError();
  },
};

export function paymentAccessToken(): string | undefined {
  return process.env.MERCADOPAGO_ACCESS_TOKEN;
}

export function paymentWebhookSecret(): string | undefined {
  return process.env.MERCADOPAGO_WEBHOOK_SECRET;
}

export type PaymentRuntime = {
  gateway: PaymentGateway;
  owner: AccountKind | null;
  token: string | undefined;
};

/**
 * Opens Checkout Pro only when the token shape and the GET /users/me profile
 * agree on test or production. A hidden or incomplete profile stays closed.
 */
export async function paymentRuntime(): Promise<PaymentRuntime> {
  const token = paymentAccessToken();
  const environment = process.env.MERCADOPAGO_ENV;

  if (credentialShape(token, environment) !== "ready" || !token?.trim()) {
    return { gateway: idleGateway, owner: null, token };
  }

  try {
    const profile = await cachedTokenOwner(token.trim());
    const owner = classifyAccount(profile?.account ?? null);
    if (!profile || !credentialOwnerMatches(environment, owner)) {
      logWarn("payment.runtime.closed", { environment: environment ?? "", owner });
      return { gateway: idleGateway, owner, token };
    }

    return {
      gateway: createMercadoPagoGateway({
        accessToken: token,
        notificationUrl: process.env.MERCADOPAGO_NOTIFICATION_URL,
        collectorId: profile.id,
        environment,
      }),
      owner,
      token,
    };
  } catch (error) {
    logError("payment.runtime.profile-lookup-failed", error);
    return { gateway: idleGateway, owner: null, token };
  }
}

const OWNER_CACHE_MS = 10 * 60_000;
let ownerCache: { key: string; expiresAt: number; profile: TokenOwner } | null = null;

type TokenOwner = NonNullable<Awaited<ReturnType<typeof readTokenOwner>>>;

/**
 * GET /users/me only changes when the token changes. Cache the successful
 * answer for 10 minutes so webhooks, checkout and order views do not each pay
 * an extra Mercado Pago round trip. Failures and empty profiles are not cached.
 */
async function cachedTokenOwner(token: string): Promise<TokenOwner | null> {
  const key = createHash("sha256").update(token).digest("hex");
  const now = Date.now();
  if (ownerCache && ownerCache.key === key && ownerCache.expiresAt > now) {
    return ownerCache.profile;
  }
  const profile = await readTokenOwner(token);
  if (profile) {
    ownerCache = { key, expiresAt: now + OWNER_CACHE_MS, profile };
  }
  return profile;
}
