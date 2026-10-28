import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { ARTWORK_VERSION, COMMERCIAL_ARTWORK_VERSION, COUNTER_ARTWORK_VERSION, SIGNAGE_ARTWORK_VERSION, STUDIO_ARTWORK_VERSION } from "./artwork.ts";
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

function commercialBody(overrides: Record<string, unknown> = {}) {
  return {
    version: 3,
    goal: "ubicacion",
    url: placeUrl,
    templateId: "minimal-elegant",
    businessName: "AtajoLab",
    subtitle: "Escaneá para ver cómo llegar",
    fontId: "fraunces",
    ink: "#1c1915",
    accent: "#8a7048",
    surface: "#f3efe6",
    foreground: "#1c1915",
    background: "#fffcf8",
    qrSize: 256,
    logo: null,
    email: "cliente@example.com",
    ...overrides,
  };
}

const commercial = parseOrderDraft(commercialBody());
assert.equal(commercial.ok, true);
if (commercial.ok && commercial.draft.artwork.version === COMMERCIAL_ARTWORK_VERSION) {
  assert.equal(commercial.draft.artwork.templateId, "minimal-elegant");
  assert.equal(commercial.draft.artwork.nfc, false);
  assert.equal(readArtworkSnapshot(commercial.draft.artwork)?.version, COMMERCIAL_ARTWORK_VERSION);
}

const legacyDark = parseOrderDraft(studioBody({ templateId: "dark-premium" }));
assert.equal(legacyDark.ok, true);
if (legacyDark.ok) assert.equal(legacyDark.draft.artwork.version, STUDIO_ARTWORK_VERSION);

const commercialDark = parseOrderDraft(commercialBody({ templateId: "dark-premium", surface: "#12100e", ink: "#f4efe4", accent: "#d4b483", foreground: "#1a1612", background: "#f7f1e6" }));
assert.equal(commercialDark.ok, true);
if (commercialDark.ok) assert.equal(commercialDark.draft.artwork.version, COMMERCIAL_ARTWORK_VERSION);

const overflowTitle = parseOrderDraft(commercialBody({ businessName: "W".repeat(42) }));
assert.equal(overflowTitle.ok, false);
if (!overflowTitle.ok) assert.equal(overflowTitle.error, "title-overflow");

const overflowSubtitle = parseOrderDraft(commercialBody({ subtitle: "W".repeat(90) }));
assert.equal(overflowSubtitle.ok, false);
if (!overflowSubtitle.ok) assert.equal(overflowSubtitle.error, "subtitle-overflow");

const missingVersion = parseOrderDraft(commercialBody({ version: undefined, templateId: "modern-business" }));
assert.equal(missingVersion.ok, false);

function counterBody(overrides: Record<string, unknown> = {}) {
  return {
    version: 4,
    goal: "ubicacion",
    url: placeUrl,
    templateId: "google-clean",
    businessName: "Taller Electromecánica Morel",
    subtitle: "Encontranos en Google Maps",
    fontId: "sora",
    ink: "#202124",
    accent: "#1a73e8",
    surface: "#ffffff",
    foreground: "#202124",
    background: "#ffffff",
    qrSize: 256,
    logo: null,
    email: "cliente@example.com",
    ...overrides,
  };
}

const counter = parseOrderDraft(counterBody());
assert.equal(counter.ok, true);
if (counter.ok && counter.draft.artwork.version === COUNTER_ARTWORK_VERSION) {
  assert.equal(counter.draft.artwork.templateId, "google-clean");
  assert.equal(counter.draft.artwork.nfc, false);
  assert.equal(readArtworkSnapshot(counter.draft.artwork)?.version, COUNTER_ARTWORK_VERSION);
}

const storedCommercial = parseOrderDraft(commercialBody());
assert.equal(storedCommercial.ok, true);
if (storedCommercial.ok) assert.equal(storedCommercial.draft.artwork.version, COMMERCIAL_ARTWORK_VERSION);

function signageBody(overrides: Record<string, unknown> = {}) {
  return {
    version: 5,
    objective: "review",
    url: reviewUrl,
    businessName: "Taller Electromecánica Morel",
    logo: null,
    format: "poster",
    templateId: "review-clean",
    fontId: "sora",
    ink: "#202124",
    accent: "#1a73e8",
    surface: "#ffffff",
    foreground: "#202124",
    background: "#ffffff",
    qrSize: 256,
    email: "cliente@example.com",
    reviewChecked: true,
    ...overrides,
  };
}

const signage = parseOrderDraft(signageBody());
assert.equal(signage.ok, true, signage.ok ? "" : signage.error);
if (signage.ok && signage.draft.artwork.version === SIGNAGE_ARTWORK_VERSION) {
  assert.equal(signage.draft.artwork.objective, "review");
  assert.equal(signage.draft.artwork.format, "poster");
  assert.equal(signage.draft.artwork.message, "Dejanos tu reseña en Google");
  assert.equal(signage.draft.artwork.href, reviewUrl);
  assert.equal(readArtworkSnapshot(signage.draft.artwork)?.version, SIGNAGE_ARTWORK_VERSION);
}

const uncheckedReview = parseOrderDraft(signageBody({ reviewChecked: false }));
assert.equal(uncheckedReview.ok, false);
if (!uncheckedReview.ok) assert.equal(uncheckedReview.error, "review-unverified");

const mapsAsReview = parseOrderDraft(signageBody({ url: placeUrl }));
assert.equal(mapsAsReview.ok, false);
if (!mapsAsReview.ok) assert.equal(mapsAsReview.error, "invalid-link");

const locationPiece = parseOrderDraft(
  signageBody({ objective: "location", url: placeUrl, reviewChecked: false, format: "sticker", templateId: "review-dark" }),
);
assert.equal(locationPiece.ok, true, locationPiece.ok ? "" : locationPiece.error);
if (locationPiece.ok && locationPiece.draft.artwork.version === SIGNAGE_ARTWORK_VERSION) {
  assert.equal(locationPiece.draft.artwork.message, "Encontranos en Google Maps");
  assert.equal(locationPiece.draft.artwork.href, placeUrl);
}

function pressBody(overrides: Record<string, unknown> = {}) {
  return {
    version: 6,
    objective: "review",
    url: reviewUrl,
    businessName: "Taller Electromecánica Morel",
    logo: null,
    format: "poster",
    templateId: "review-clean",
    fontId: "sora",
    ink: "#202124",
    accent: "#1a73e8",
    surface: "#ffffff",
    foreground: "#202124",
    background: "#ffffff",
    qrSize: 256,
    email: "cliente@example.com",
    reviewChecked: true,
    ...overrides,
  };
}

const press = parseOrderDraft(pressBody());
assert.equal(press.ok, true, press.ok ? "" : press.error);
if (press.ok && press.draft.artwork.version === 6) {
  assert.equal(press.draft.artwork.message, "Dejanos tu reseña en Google");
  assert.equal(press.draft.artwork.instruction, "Escaneá el QR con tu celular");
  assert.equal(press.draft.artwork.href, reviewUrl);
  assert.equal(readArtworkSnapshot(press.draft.artwork)?.version, 6);
  const changed = { ...press.draft.artwork, message: "Otra frase" };
  assert.equal(readArtworkSnapshot(changed), null);
}

const pressLocation = parseOrderDraft(
  pressBody({ objective: "location", url: placeUrl, reviewChecked: false, templateId: "review-dark", format: "sticker" }),
);
assert.equal(pressLocation.ok, true, pressLocation.ok ? "" : pressLocation.error);
if (pressLocation.ok && pressLocation.draft.artwork.version === 6) {
  assert.equal(pressLocation.draft.artwork.message, "Encontranos en Google Maps");
  assert.equal(pressLocation.draft.artwork.href, placeUrl);
  assert.equal(press.ok && press.draft.artwork.version === 6 && press.draft.artwork.message !== pressLocation.draft.artwork.message, true);
}

const { version: _version, ...versionless } = signageBody();
const withoutVersion = parseOrderDraft(versionless);
assert.equal(withoutVersion.ok, false);
if (!withoutVersion.ok) assert.equal(withoutVersion.error, "invalid-body");

const pressUnchecked = parseOrderDraft(pressBody({ reviewChecked: false }));
assert.equal(pressUnchecked.ok, false);
if (!pressUnchecked.ok) assert.equal(pressUnchecked.error, "review-unverified");

console.log("order draft checks passed");
