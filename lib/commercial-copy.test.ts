import assert from "node:assert/strict";
import {
  faqDownloadAnswer,
  faqPriceAnswer,
  heroTrustLine,
  nextQrNote,
  orderFreeNote,
  priceLabel,
  termsPriceText,
} from "./commercial-copy.ts";
import { getFaqItems } from "./faq.ts";
import { PIECE_PRICE_ARS } from "./pricing.ts";

// Public wording about price and payment follows the real sales state.
const priceDigits = String(PIECE_PRICE_ARS).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

{
  // Sales closed: no price and no promise of a purchase anywhere.
  const closed = [
    nextQrNote(false) ?? "",
    faqPriceAnswer(false),
    faqDownloadAnswer(false),
    termsPriceText(false),
    orderFreeNote(false),
    heroTrustLine(false),
    ...getFaqItems(false).flatMap((item) => [item.question, item.answer]),
  ].join(" ");
  assert.equal(closed.includes(priceDigits), false, "no price while sales are closed");
  assert.equal(/Mercado Pago|pago único|cuestan/.test(closed), false, "no purchase wording while sales are closed");
  assert.equal(nextQrNote(false), null);
  // The first free QR is always described.
  assert.match(faqPriceAnswer(false), /primer QR es gratis/);
  assert.match(termsPriceText(false), /primer QR es gratuito/);
}

{
  // Sales open: the price and the payment wording come back by themselves.
  assert.ok(priceLabel().includes(priceDigits));
  assert.ok(nextQrNote(true)?.includes(priceDigits));
  assert.ok(faqPriceAnswer(true).includes(priceDigits));
  assert.match(faqPriceAnswer(true), /primer QR es gratis/);
  assert.match(faqDownloadAnswer(true), /Mercado Pago aprueba el pago/);
  assert.ok(termsPriceText(true).includes(priceDigits));
  assert.ok(orderFreeNote(true).includes(priceDigits));
  assert.match(heroTrustLine(true), /Mercado Pago/);
}

{
  // Same questions in both states; only the price and download answers differ.
  const open = getFaqItems(true);
  const closed = getFaqItems(false);
  assert.deepEqual(open.map((item) => item.question), closed.map((item) => item.question));
  const different = open.filter((item, index) => item.answer !== closed[index]!.answer).map((item) => item.question);
  assert.deepEqual(different, ["¿Cuánto cuesta?", "¿Cuándo puedo descargar los archivos?"]);
}

console.log("commercial copy checks passed");
