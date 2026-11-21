/**
 * Studio v8 commercial checkout (order create + Mercado Pago preference).
 *
 * Off by default in every environment — set STUDIO_CHECKOUT_ENABLED=true to enable.
 * When off: /crear remains an editor; POST /api/orders (v8) and v8 checkout are refused.
 * Already-PAID v8 orders keep downloads/reconcile/webhooks (those paths ignore this flag).
 */
export function studioCheckoutAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.STUDIO_CHECKOUT_ENABLED ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes" || flag === "on";
}

/**
 * The operator's explicit go-live confirmation: STUDIO_SALES_CONFIRMED=true. It is set by hand after
 * the controlled purchase works and the published terms were reviewed to take payments. It is a
 * deliberate decision, not a check on the seller's legal data.
 */
export function studioSalesConfirmed(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.STUDIO_SALES_CONFIRMED ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes" || flag === "on";
}

/**
 * New sales need the checkout switch (`STUDIO_CHECKOUT_ENABLED`) and the operator's confirmation
 * (`STUDIO_SALES_CONFIRMED`). The seller's legal data (`lib/legal.ts`) is deliberately not part of
 * this decision: pending "[COMPLETAR]" fields are shown on the legal pages but never disable
 * checkout. Payment safety lives in `lib/payments`.
 */
export function studioSalesOpen(env: NodeJS.ProcessEnv = process.env): boolean {
  return studioCheckoutAllowed(env) && studioSalesConfirmed(env);
}
