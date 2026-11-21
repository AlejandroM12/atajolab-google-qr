import { credentialOwnerMatches, credentialShape } from "@/lib/payments/checkout-policy";
import { paymentRuntime } from "@/lib/payments/mercadopago";
import { studioSalesOpen } from "@/lib/studio/checkout-access";

/**
 * True only when a visitor can really pay for an extra QR: the commercial switch is on
 * (`STUDIO_CHECKOUT_ENABLED`) and Mercado Pago is configured for this environment (token
 * shape and the account behind it agree on test or production).
 *
 * Public pages use it to decide whether to show a price: they never announce a purchase
 * that could not be completed. It does not look at the seller's legal data, which has no
 * effect on payments. Mercado Pago's profile lookup runs only after the cheap checks pass
 * and is cached by `paymentRuntime`.
 */
export async function purchasesAvailable(): Promise<boolean> {
  if (!studioSalesOpen()) return false;
  if (credentialShape(process.env.MERCADOPAGO_ACCESS_TOKEN, process.env.MERCADOPAGO_ENV) !== "ready") return false;
  const runtime = await paymentRuntime();
  return credentialOwnerMatches(process.env.MERCADOPAGO_ENV, runtime.owner);
}
