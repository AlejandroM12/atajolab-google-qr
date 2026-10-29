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
    const profile = await readTokenOwner(token.trim());
    const owner = classifyAccount(profile?.account ?? null);
    if (!profile || !credentialOwnerMatches(environment, owner)) {
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
    console.error("payment profile lookup failed", error instanceof Error ? error.name : "unknown");
    return { gateway: idleGateway, owner: null, token };
  }
}
