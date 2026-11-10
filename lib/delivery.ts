export const orderStatuses = ["PENDING", "PAID", "CANCELLED", "FREE"] as const;

export type OrderStatus = (typeof orderStatuses)[number];

/**
 * Digital downloads stay permanently enabled in code (not an env flag).
 * Turning this off accidentally would break PAID v7/v8 delivery.
 * Authorization still requires a deliverable status + matching delivery/access key hash.
 */
export const DIGITAL_DOWNLOADS_ENABLED = true;

/**
 * PAID: confirmed Mercado Pago payment. FREE: "Tu primer QR es gratis" promotion.
 * Both deliver the same files; only PAID ever involves a payment.
 */
export function orderDeliverable(status: string): status is "PAID" | "FREE" {
  return status === "PAID" || status === "FREE";
}

export function canDownloadOrderFiles(status: OrderStatus): boolean {
  return DIGITAL_DOWNLOADS_ENABLED && orderDeliverable(status);
}
