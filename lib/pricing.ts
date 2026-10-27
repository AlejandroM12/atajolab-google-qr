/** Precio único de la pieza digital. El navegador no puede cambiarlo. */
export const PIECE_PRICE_ARS = 4900;

export const PIECE_CURRENCY = "ARS" as const;

export function formatArs(amount: number): string {
  return `$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(amount)}`;
}
