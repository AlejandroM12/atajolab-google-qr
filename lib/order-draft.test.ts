import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { ARTWORK_VERSION, STUDIO_ARTWORK_VERSION } from "./artwork.ts";
import { canDownloadOrderFiles } from "./delivery.ts";
import { parseOrderDraft, readArtworkSnapshot } from "./order-draft.ts";
import { PIECE_PRICE_ARS } from "./pricing.ts";

const placeUrl = "https://www.google.com/maps/place/Obelisco/@-34.6037,-58.3816,17z";
const reviewUrl = "https://search.google.com/local/writereview?placeid=ChIJabcdefghij";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    goal: "ubicacion",
    url: placeUrl,
    templateId: "cartel-ubicacion",
    businessName: "AtajoLab",
    headline: "Escaneá para ver cómo llegar",
    foreground: "#14221f",
    background: "#ffffff",
    qrSize: 256,
    email: "cliente@example.com",
    ...overrides,
  };
}

const created = parseOrderDraft(validBody());
assert.equal(created.ok, true);
if (created.ok) {
  assert.equal(created.draft.amountArs, PIECE_PRICE_ARS);
  assert.equal(created.draft.currency, "ARS");
  assert.equal(created.draft.artwork.version, ARTWORK_VERSION);
  assert.equal(created.draft.buyerEmail, "cliente@example.com");
  assert.equal("buyerEmail" in created.draft.artwork, false);
  assert.equal(created.draft.artwork.goal, "ubicacion");
  assert.equal(created.draft.artwork.href?.startsWith("https://www.google.com/maps/place/"), true);
  assert.equal(Object.hasOwn(created.draft, "status"), false);
  const stored = readArtworkSnapshot(created.draft.artwork);
  assert.equal(stored?.href, created.draft.artwork.href);
}

assert.equal(parseOrderDraft({ ...validBody(), amountArs: 1 }).ok, false);
assert.equal(parseOrderDraft({ ...validBody(), price: 0 }).ok, false);
assert.equal(parseOrderDraft({ ...validBody(), status: "PAID" }).ok, false);
assert.equal(parseOrderDraft({ ...validBody(), href: "https://evil.example" }).ok, false);

const reviewAsLocation = parseOrderDraft(validBody({ url: reviewUrl }));
assert.equal(reviewAsLocation.ok, false);
if (!reviewAsLocation.ok) assert.equal(reviewAsLocation.error, "invalid-link");

const httpLink = parseOrderDraft(validBody({ url: "http://maps.google.com/?cid=1234567890123" }));
assert.equal(httpLink.ok, false);

const lowContrast = parseOrderDraft(validBody({ foreground: "#f3f0e8" }));
assert.equal(lowContrast.ok, false);
if (!lowContrast.ok) assert.equal(lowContrast.error, "insufficient-contrast");

const blankName = parseOrderDraft(validBody({ businessName: "   " }));
assert.equal(blankName.ok, false);
if (!blankName.ok) assert.equal(blankName.error, "invalid-text");

const badTemplate = parseOrderDraft(validBody({ templateId: "flyer" }));
assert.equal(badTemplate.ok, false);
if (!badTemplate.ok) assert.equal(badTemplate.error, "invalid-template");

assert.equal(canDownloadOrderFiles("PENDING"), false);
assert.equal(canDownloadOrderFiles("PAID"), true);
assert.equal(canDownloadOrderFiles("CANCELLED"), false);

function tinyLogo(): string {
  const png = new PNG({ width: 16, height: 16, colorType: 6 });
  png.data.fill(255);
  return PNG.sync.write(png).toString("base64");
}

function studioBody(overrides: Record<string, unknown> = {}) {
  return {
    goal: "resena",
    url: reviewUrl,
    templateId: "brand-identity",
    businessName: "Panadería Sur",
    subtitle: "Contanos cómo te atendimos",
    fontId: "fraunces",
    ink: "#14221f",
    accent: "#0f6e62",
    surface: "#fbfaf7",
    foreground: "#14221f",
    background: "#ffffff",
    qrSize: 256,
    logo: null,
    email: "cliente@example.com",
    ...overrides,
  };
}

const studio = parseOrderDraft(studioBody());
assert.equal(studio.ok, true);
if (studio.ok && studio.draft.artwork.version === STUDIO_ARTWORK_VERSION) {
  assert.equal(studio.draft.amountArs, PIECE_PRICE_ARS);
  assert.equal(studio.draft.artwork.serviceLine, "Reseña en Google");
  assert.equal(studio.draft.artwork.nfc, false);
  assert.equal(studio.draft.artwork.logo, null);
  assert.equal(studio.draft.artwork.fontId, "fraunces");
  assert.equal(readArtworkSnapshot(studio.draft.artwork)?.version, STUDIO_ARTWORK_VERSION);
  assert.equal(readArtworkSnapshot({ ...studio.draft.artwork, serviceLine: "Google Maps" }), null);
  assert.equal(readArtworkSnapshot({ ...studio.draft.artwork, nfc: true }), null);
  assert.equal(readArtworkSnapshot({ ...studio.draft.artwork, version: 3 }), null);
}

const withLogo = parseOrderDraft(studioBody({ templateId: "dark-premium", logo: { data: tinyLogo() } }));
assert.equal(withLogo.ok, true);
if (withLogo.ok && withLogo.draft.artwork.version === STUDIO_ARTWORK_VERSION && withLogo.draft.artwork.logo) {
  assert.equal(withLogo.draft.artwork.logo.width, 16);
  assert.equal(withLogo.draft.artwork.logo.height, 16);
  assert.equal(withLogo.draft.artwork.logo.mime, "image/png");
  assert.equal(withLogo.draft.artwork.serviceLine, "Reseña en Google");
  assert.equal(
    readArtworkSnapshot({
      ...withLogo.draft.artwork,
      logo: { ...withLogo.draft.artwork.logo, width: 32 },
    }),
    null,
  );
}

const badLogo = parseOrderDraft(studioBody({ logo: { data: "not-a-png" } }));
assert.equal(badLogo.ok, false);
if (!badLogo.ok) assert.equal(badLogo.error, "invalid-logo");

const extraLogoField = parseOrderDraft(studioBody({ logo: { data: tinyLogo(), width: 16 } }));
assert.equal(extraLogoField.ok, false);
if (!extraLogoField.ok) assert.equal(extraLogoField.error, "invalid-logo");

const clientNfc = parseOrderDraft(studioBody({ nfc: false }));
assert.equal(clientNfc.ok, false);
if (!clientNfc.ok) assert.equal(clientNfc.error, "unexpected-field");

const lowInk = parseOrderDraft(studioBody({ ink: "#f4f1ea", surface: "#ffffff" }));
assert.equal(lowInk.ok, false);
if (!lowInk.ok) assert.equal(lowInk.error, "insufficient-contrast");

const badFont = parseOrderDraft(studioBody({ fontId: "comic" }));
assert.equal(badFont.ok, false);
if (!badFont.ok) assert.equal(badFont.error, "invalid-font");

const badEmail = parseOrderDraft(studioBody({ email: "cliente@example.com\nBcc:otro@example.com" }));
assert.equal(badEmail.ok, false);
if (!badEmail.ok) assert.equal(badEmail.error, "invalid-email");

const normalizedEmail = parseOrderDraft(validBody({ email: "Cliente@Example.com" }));
assert.equal(normalizedEmail.ok, true);
if (normalizedEmail.ok) assert.equal(normalizedEmail.draft.buyerEmail, "cliente@example.com");

console.log("order draft checks passed");
