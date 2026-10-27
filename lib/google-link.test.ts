import assert from "node:assert/strict";
import { artworkExportFormats, artworkTemplates, buildProductArtwork } from "./artwork.ts";
import { assessContrast, contrastRatio } from "./color.ts";
import { validateGoogleLink, type GoogleLinkGoal, type LinkIssue } from "./google-link.ts";

function expectOk(input: string, goal: GoogleLinkGoal, hostname: string) {
  const result = validateGoogleLink(input, goal);
  assert.equal(result.ok, true, `${goal} should accept ${input} (${JSON.stringify(result)})`);
  if (!result.ok) return;
  const parsed = new URL(result.href);
  assert.equal(parsed.protocol, "https:");
  assert.equal(parsed.hostname, hostname);
  assert.equal(parsed.username, "");
  assert.equal(parsed.password, "");
}

function expectIssue(input: string, goal: GoogleLinkGoal, issue: LinkIssue) {
  const result = validateGoogleLink(input, goal);
  assert.equal(result.ok, false, `${goal} should reject ${input}`);
  if (!result.ok) {
    assert.equal(result.issue, issue, `${input} [${goal}] -> ${result.issue}, expected ${issue}`);
  }
}

const placeId = "ChIJabcdefghijklmnopqrst";
const reviewUrl = `https://search.google.com/local/writereview?placeid=${placeId}`;

expectOk("https://maps.app.goo.gl/abcDEF12", "ubicacion", "maps.app.goo.gl");
expectOk("https://www.google.com/maps?q=-34.6037,-58.3816", "ubicacion", "www.google.com");
expectOk(
  "https://www.google.com/maps/place/Obelisco/@-34.6037,-58.3816,17z",
  "ubicacion",
  "www.google.com",
);
expectOk("https://maps.google.com/?cid=1234567890123", "ubicacion", "maps.google.com");
expectOk(
  "https://www.google.com.ar/maps/search/?api=1&query=Obelisco",
  "ubicacion",
  "www.google.com.ar",
);
expectOk("https://goo.gl/maps/abcDEF12", "ubicacion", "goo.gl");
expectOk("HTTPS://WWW.GOOGLE.COM/maps?q=Palermo", "ubicacion", "www.google.com");
expectOk("https://google.com/maps?q=Centro", "ubicacion", "google.com");
expectOk(reviewUrl, "resena", "search.google.com");
expectOk("https://g.page/r/CabcDEF123/review", "resena", "g.page");
expectOk("https://g.page/mi-local/review", "resena", "g.page");
expectOk(
  `https://www.google.com/local/writereview?placeid=${placeId}`,
  "resena",
  "www.google.com",
);
expectOk("https://g.page/r/CabcDEF123/review?gm", "resena", "g.page");

expectIssue("http://www.google.com/maps?q=test", "ubicacion", "insecure-protocol");
expectIssue("javascript:alert(1)", "ubicacion", "insecure-protocol");
expectIssue("https://user:pass@www.google.com/maps?q=test", "ubicacion", "credentials");
expectIssue("https://www.google.com@evil.com/maps?q=test", "ubicacion", "credentials");
expectIssue("https://www.google.com:8443/maps?q=test", "ubicacion", "port");
expectIssue("https://google.com.evil.com/maps?q=test", "ubicacion", "unsupported-google-domain");
expectIssue(
  "https://www.google.com.evil.com/maps/place/x",
  "ubicacion",
  "unsupported-google-domain",
);
expectIssue(
  "https://maps.google.com.attacker.com/?q=test",
  "ubicacion",
  "unsupported-google-domain",
);
expectIssue("https://notgoogle.com/maps?q=test", "ubicacion", "not-google");
expectIssue("https://mygoogle.com/maps?q=test", "ubicacion", "not-google");
expectIssue("https://maps.app.goo.gl.evil.com/abcDEF12", "ubicacion", "not-google");
expectIssue("https://g.page.evil.com/r/abcdEFGH/review", "resena", "not-google");
expectIssue(
  "https://search.google.com.evil.com/local/writereview?placeid=ChIJabcdefghij",
  "resena",
  "not-google",
);
expectIssue("https://www.google.com/maps", "ubicacion", "generic-maps");
expectIssue("https://maps.google.com/", "ubicacion", "generic-maps");
expectIssue("https://www.google.com/search?q=maps", "ubicacion", "not-location");
expectIssue("https://www.google.com/url?q=https://evil.com", "ubicacion", "not-location");
expectIssue("https://maps.app.goo.gl/ab", "ubicacion", "incomplete-short-link");
expectIssue("https://goo.gl/abcdEF12", "ubicacion", "unsupported-short-link");
expectIssue(reviewUrl, "ubicacion", "review-instead-of-location");
expectIssue("https://www.google.com/maps?q=test", "resena", "location-instead-of-review");
expectIssue("https://maps.app.goo.gl/abcDEF12", "resena", "location-instead-of-review");
expectIssue("https://g.page/r/CabcDEF123", "resena", "gpage-not-review");
expectIssue("https://search.google.com/local/writereview", "resena", "missing-place-id");
expectIssue(
  "https://search.google.com/local/writereview?placeid=short",
  "resena",
  "invalid-place-id",
);
expectIssue("https://business.google.com/", "resena", "business-profile");
expectIssue("https://www.google.com/maps?q=test%0a", "ubicacion", "unsafe-characters");
expectIssue("   ", "ubicacion", "empty");
expectIssue(`https://evil.com/maps?q=${encodeURIComponent(reviewUrl)}`, "resena", "not-google");

for (const sneaky of [
  "https://www.google.com%2eevil.com/maps?q=1",
  "https://www.google.com%2f.evil.com/maps?q=1",
  "https://google.com%00.evil.com/maps?q=1",
  "https://maps.app.goo.gl%2e.evil.com/abcDEF12",
  "https://www.google.com.evil.com/maps?q=1",
  "https://google.com.ar.phishing.com/maps?q=1",
]) {
  const result = validateGoogleLink(sneaky, "ubicacion");
  assert.equal(result.ok, false, `deceptive URL was accepted: ${sneaky}`);
}

const blackOnWhite = contrastRatio("#000000", "#ffffff");
assert.ok(blackOnWhite > 20);
assert.equal(assessContrast("#ffffff", "#ffffff").sufficient, false);
assert.equal(assessContrast("#14221f", "#ffffff").sufficient, true);
assert.equal(assessContrast("#14221f", "#ffffff").inverted, false);

const artwork = buildProductArtwork({
  templateId: "sticker",
  goal: "ubicacion",
  businessName: "  ",
  headline: "  Escaneá para ver cómo llegar  ",
  foreground: "#14221f",
  background: "#ffffff",
  qrSize: 256,
  href: null,
});
assert.equal(artwork.version, 1);
assert.equal(artwork.businessName, "");
assert.equal(artwork.headline, "Escaneá para ver cómo llegar");
assert.equal(artwork.href, null);
assert.deepEqual(artworkExportFormats, ["png", "svg", "pdf"]);
assert.equal(artworkTemplates.length, 3);

console.log("google-link checks passed");
console.log(
  "ui contrast",
  JSON.stringify({
    mutedOnPaper: contrastRatio("#5c675f", "#f3f0e8").toFixed(2),
    accentOnPaper: contrastRatio("#0f6e62", "#f3f0e8").toFixed(2),
    whiteOnAccent: contrastRatio("#ffffff", "#0f6e62").toFixed(2),
    dangerOnPaper: contrastRatio("#8d2c2c", "#f3f0e8").toFixed(2),
    inkOnPaper: contrastRatio("#14221f", "#f3f0e8").toFixed(2),
  }),
);
