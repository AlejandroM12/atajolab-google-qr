export const orderStatuses = ["PENDING", "PAID", "CANCELLED"] as const;

export type OrderStatus = (typeof orderStatuses)[number];

/**
 * Digital downloads stay permanently enabled in code (not an env flag).
 * Turning this off accidentally would break PAID v7/v8 delivery.
 * Authorization still requires PAID status + matching delivery/access key hash.
 */
export const DIGITAL_DOWNLOADS_ENABLED = true;

export function canDownloadOrderFiles(status: OrderStatus): boolean {
  return DIGITAL_DOWNLOADS_ENABLED && status === "PAID";
}
