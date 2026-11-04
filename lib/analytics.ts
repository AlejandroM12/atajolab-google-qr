/**
 * Client-side funnel events. No-op without the analytics script.
 * Never pass emails, order ids, links or free text: only fixed labels.
 */

export type FunnelEvent =
  | "editor_opened"
  | "inspiration_picked"
  | "order_created"
  | "checkout_started"
  | "payment_confirmed"
  | "download_clicked"
  | "recovery_requested";

type Plausible = (event: string, options?: { props?: Record<string, string> }) => void;

export function trackEvent(event: FunnelEvent, props?: Record<string, string>): void {
  if (typeof window === "undefined") return;
  const plausible = (window as unknown as { plausible?: Plausible }).plausible;
  if (typeof plausible !== "function") return;
  try {
    plausible(event, props ? { props } : undefined);
  } catch {
    // Analytics must never break the purchase flow.
  }
}
