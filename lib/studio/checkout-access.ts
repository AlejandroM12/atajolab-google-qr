import { legalDataComplete } from "@/lib/legal";

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
 * New sales need the flag AND, in production, complete seller data in
 * lib/legal.ts (Ley 24.240 requires identifying the seller). Turning the flag
 * on with "[COMPLETAR]" placeholders keeps checkout closed.
 */
export function studioSalesOpen(
  env: NodeJS.ProcessEnv = process.env,
  legalComplete: boolean = legalDataComplete(),
): boolean {
  if (!studioCheckoutAllowed(env)) return false;
  if (env.NODE_ENV === "production" && !legalComplete) return false;
  return true;
}
