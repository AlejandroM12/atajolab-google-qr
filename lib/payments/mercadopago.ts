import { sandboxCredentialState } from "@/lib/payments/checkout-policy";
import { PaymentProviderError, createMercadoPagoGateway, type PaymentGateway } from "@/lib/payments/gateway";

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

export function gatewayForRequest(): PaymentGateway {
  const accessToken = paymentAccessToken();

  if (sandboxCredentialState(accessToken) !== "ready") {
    return idleGateway;
  }

  return createMercadoPagoGateway({
    accessToken,
    notificationUrl: process.env.MERCADOPAGO_NOTIFICATION_URL,
  });
}
