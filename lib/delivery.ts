export const orderStatuses = ["PENDING", "PAID", "CANCELLED"] as const;

export type OrderStatus = (typeof orderStatuses)[number];

/**
 * La descarga además exige la clave httpOnly del pedido.
 * El endpoint rechaza el archivo si esa clave no coincide.
 */
export const DIGITAL_DOWNLOADS_ENABLED = true;

export function canDownloadOrderFiles(status: OrderStatus): boolean {
  return DIGITAL_DOWNLOADS_ENABLED && status === "PAID";
}
