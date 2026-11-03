/**
 * Studio v8 commercial checkout (order create + Mercado Pago preference).
 *
 * Off by default in every environment — set STUDIO_CHECKOUT_ENABLED=true to enable.
 * When off: /studio remains an editor; POST /api/orders (v8) and v8 checkout are refused.
 * Already-PAID v8 orders keep downloads/reconcile/webhooks (those paths ignore this flag).
 */
export function studioCheckoutAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.STUDIO_CHECKOUT_ENABLED ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes" || flag === "on";
}
