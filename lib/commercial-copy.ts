import { formatArs, PIECE_CURRENCY, PIECE_PRICE_ARS } from "@/lib/pricing";

/**
 * Public wording about price and payment. It follows the real sales state
 * (`studioSalesOpen()`): while sales are closed nothing offers a purchase or shows a
 * price that cannot be paid; when sales open, the price and the payment wording come back
 * on their own. The first free QR is not affected by any of this.
 */

/** "$ 4.900 ARS". */
export function priceLabel(): string {
  return `${formatArs(PIECE_PRICE_ARS)} ${PIECE_CURRENCY}`;
}

/** Sentence after "Tu primer QR es gratis. Uno por navegador y por correo." or null while nothing else is on sale. */
export function nextQrNote(salesOpen: boolean): string | null {
  return salesOpen ? `Los siguientes cuestan ${priceLabel()}.` : null;
}

export function faqPriceAnswer(salesOpen: boolean): string {
  return salesOpen
    ? `${formatArs(PIECE_PRICE_ARS)} por cartel, pago único con Mercado Pago. No hay suscripción. Tu primer QR es gratis: uno por navegador y por correo.`
    : "Tu primer QR es gratis: uno por navegador y por correo. Por ahora no hay otros QR a la venta; si se habilitan, el precio se informa en esta página y en la herramienta antes de comprar.";
}

export function faqDownloadAnswer(salesOpen: boolean): string {
  return salesOpen
    ? "Apenas Mercado Pago aprueba el pago. La página del pedido se actualiza sola. Si pagaste en efectivo, la aprobación puede demorar más. Tu primer QR gratis se habilita al instante."
    : "Al instante: tu primer QR gratis se habilita apenas lo pedís, y la página del pedido te lleva a la descarga.";
}

export function termsPriceText(salesOpen: boolean): string {
  return salesOpen
    ? `El precio es ${formatArs(PIECE_PRICE_ARS)} en pesos argentinos por pieza, pago único.`
    : "Tu primer QR es gratuito (uno por navegador y por correo). Hoy no hay otras piezas a la venta; si se habilitan, el precio se informará en el sitio antes de que compres.";
}

export function orderFreeNote(salesOpen: boolean): string {
  return salesOpen
    ? `Ya podés descargar los archivos. Los siguientes QR cuestan ${priceLabel()}.`
    : "Ya podés descargar los archivos.";
}

/** Short trust line under the main button: the payment method is named only while there is something to pay. */
export function heroTrustLine(salesOpen: boolean): string {
  return salesOpen ? "Sin registrarte · Pago con Mercado Pago · Descarga digital" : "Sin registrarte · Descarga digital";
}
