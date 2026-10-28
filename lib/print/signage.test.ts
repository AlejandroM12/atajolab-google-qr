import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import {
  SIGNAGE_ARTWORK_VERSION,
  signageFormats,
  signageTemplates,
  type SignageFormat,
  type SignageTemplateId,
} from "../artwork.ts";
import { contrastRatio } from "../color.ts";
import { parseOrderDraft } from "../order-draft.ts";
import { fontFile, printFonts, type PrintFontRole } from "./fonts.ts";
import { layoutArtwork, type DrawCommand } from "./layout.ts";
import { renderArtworkSvg } from "./preview.ts";
import { printPixels, renderArtworkFile } from "./render.ts";

const placeUrl = "https://www.google.com/maps/place/Obelisco/@-34.6037,-58.3816,17z";
const reviewUrl = "https://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnopqrst";
const longName = "Taller Electromecánico de la Esquina Norte";

const palettes = {
  "review-clean": { fontId: "sora", ink: "#202124", accent: "#1a73e8", surface: "#ffffff", foreground: "#202124", background: "#ffffff" },
  "review-dark": { fontId: "sora", ink: "#f5f6f7", accent: "#d2d6dc", surface: "#101114", foreground: "#101114", background: "#ffffff" },
  "review-brand": { fontId: "source", ink: "#1a1a1a", accent: "#0f6e62", surface: "#f7f5f2", foreground: "#1a1a1a", background: "#ffffff" },
} as const;

function logo(width: number, height: number): string {
  const png = new PNG({ width, height, colorType: 6 });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = 20;
    png.data[index + 1] = 90;
    png.data[index + 2] = 70;
    png.data[index + 3] = 255;
  }
  return PNG.sync.write(png).toString("base64");
}

function piece(
  templateId: SignageTemplateId,
  format: SignageFormat,
  overrides: Record<string, unknown> = {},
) {
  const parsed = parseOrderDraft({
    version: 5,
    objective: "review",
    url: reviewUrl,
    businessName: longName,
    logo: null,
    format,
    templateId,
    qrSize: 256,
    email: "cliente@example.com",
    reviewChecked: true,
    ...palettes[templateId],
    ...overrides,
  });
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  if (!parsed.ok || parsed.draft.artwork.version !== SIGNAGE_ARTWORK_VERSION) throw new Error("signage");
  return parsed.draft.artwork;
}

function textsOf(commands: DrawCommand[]) {
  return commands.filter((command): command is Extract<DrawCommand, { type: "text" }> => command.type === "text");
}

for (const template of signageTemplates) {
  for (const format of signageFormats) {
    const artwork = piece(template.id, format.id);
    const scene = layoutArtwork(artwork);
    assert.equal(scene.widthMm, format.widthMm);
    assert.equal(scene.heightMm, format.heightMm);
    const visible = textsOf(scene.commands).map((command) => command.text).join(" ");
    assert.equal(visible.includes("…"), false);
    assert.equal(visible.includes("NFC"), false);
    assert.equal(visible.includes(longName), true);
    assert.equal(visible.includes("Dejanos tu reseña en Google"), true);
    assert.equal(visible.includes("Escaneá el QR con tu celular"), true);
    assert.equal(scene.commands.some((command) => command.type === "image"), false);
    const qr = scene.commands.find((command) => command.type === "qr");
    assert.ok(qr && qr.type === "qr");
    if (qr && qr.type === "qr") assert.ok(qr.size >= (format.id === "poster" ? 58 : 40));
    const messageSize = Math.max(...textsOf(scene.commands).map((command) => command.size));
    const nameCommands = textsOf(scene.commands).filter((command) => longName.includes(command.text));
    const nameSize = nameCommands[0]?.size ?? messageSize;
    assert.ok(messageSize >= nameSize + 0.8);
    for (const command of textsOf(scene.commands)) {
      assert.ok(contrastRatio(command.color, artwork.surface) >= 3);
    }
  }
}

const cleanPoster = piece("review-clean", "poster");
const cleanSvg = renderArtworkSvg(cleanPoster);
const cleanPng = await renderArtworkFile(cleanPoster, "png");
const cleanPdf = await renderArtworkFile(cleanPoster, "pdf");
assert.ok(cleanPdf.body.length > 1000);
assert.equal(cleanSvg, (await renderArtworkFile(cleanPoster, "svg")).body.toString("utf8"));
assert.equal(cleanPng.body.readUInt32BE(16), printPixels(105));
assert.equal(cleanPng.body.readUInt32BE(20), printPixels(148));
assert.equal(decodePng(cleanPng.body), reviewUrl);
assert.equal(decodeSvg(cleanSvg, printPixels(105)), reviewUrl);

const sticker = piece("review-dark", "sticker", { objective: "location", url: placeUrl, reviewChecked: false });
assert.equal(sticker.href, placeUrl);
assert.equal(sticker.message, "Encontranos en Google Maps");
const stickerScene = layoutArtwork(sticker);
assert.equal(stickerScene.widthMm, 80);
assert.equal(stickerScene.heightMm, 80);
assert.equal(decodePng((await renderArtworkFile(sticker, "png")).body), placeUrl);

for (const [width, height] of [
  [80, 80],
  [160, 48],
  [48, 140],
] as const) {
  const branded = layoutArtwork(piece("review-brand", "poster", { logo: { data: logo(width, height) }, businessName: "Panadería Sur" }));
  const image = branded.commands.find((command) => command.type === "image");
  assert.ok(image && image.type === "image");
  if (image && image.type === "image") {
    if (width > height) assert.ok(image.w > image.h);
    if (height > width) assert.ok(image.h > image.w);
  }
}

const withoutLogo = layoutArtwork(piece("review-brand", "poster"));
assert.equal(withoutLogo.commands.some((command) => command.type === "image"), false);

const custom = piece("review-clean", "poster", {
  businessName: "Kiosco",
  ink: "#10211c",
  surface: "#f4f7f6",
  accent: "#0f6e62",
  foreground: "#10211c",
  background: "#ffffff",
});
const customScene = layoutArtwork(custom);
assert.ok(customScene.commands.some((command) => command.type === "text" && command.color === "#10211c"));
assert.ok(customScene.commands.some((command) => command.type === "rect" && command.fill === "#0f6e62"));

const overflow = parseOrderDraft({
  version: 5,
  objective: "review",
  url: reviewUrl,
  businessName: "W".repeat(42),
  logo: null,
  format: "sticker",
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
});
assert.equal(overflow.ok, false);
if (!overflow.ok) assert.equal(overflow.error, "title-overflow");

const fingerprints = {
  v1: "a6d16278de66bb235eb4858fb902a0cf227f76e4b4ba57ed4a737a1acd26ed73",
  v2: "ca82fdac2087526e93cd628793a7b53e4e4669f3a0a1893e53c2ffe0cab19288",
  v3: "6356f4216bf8c9994485e487c80cb65cdb738ebc52ba21ce396f8aaf4b9c1634",
  v4: "623308df8de1ad0833729c89b017ff2a1b305d3144a4a863d4cf30215a5257a0",
  v5: "bd188b03f278c11e1ae1faec39a898d431805cecdd748cdcd82656ce294a4d32",
};

const historical = [
  ["v1", fingerprints.v1, {
    goal: "ubicacion",
    url: placeUrl,
    templateId: "cartel-ubicacion",
    businessName: "Taller Electromecánica Morel",
    headline: "Escaneá para ver cómo llegar",
    foreground: "#14221f",
    background: "#ffffff",
    qrSize: 256,
    email: "cliente@example.com",
  }],
  ["v2", fingerprints.v2, {
    goal: "ubicacion",
    url: placeUrl,
    templateId: "minimal-elegance",
    businessName: "Taller Electromecánica Morel",
    subtitle: "Encontranos en Google Maps",
    fontId: "fraunces",
    ink: "#1c1915",
    accent: "#8a7048",
    surface: "#f3efe6",
    foreground: "#1c1915",
    background: "#fffcf8",
    qrSize: 256,
    logo: null,
    email: "cliente@example.com",
  }],
  ["v3", fingerprints.v3, {
    version: 3,
    goal: "ubicacion",
    url: placeUrl,
    templateId: "dark-premium",
    businessName: "Taller Electromecánica Morel",
    subtitle: "Encontranos en Google Maps",
    fontId: "fraunces",
    ink: "#f4efe4",
    accent: "#d4b483",
    surface: "#12100e",
    foreground: "#1a1612",
    background: "#f7f1e6",
    qrSize: 256,
    logo: null,
    email: "cliente@example.com",
  }],
  ["v4", fingerprints.v4, {
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
  }],
  ["v5", fingerprints.v5, {
    version: 5,
    objective: "location",
    url: placeUrl,
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
    reviewChecked: false,
  }],
] as const;

for (const [label, expected, body] of historical) {
  const parsed = parseOrderDraft(body);
  assert.equal(parsed.ok, true, `${label} ${parsed.ok ? "" : parsed.error}`);
  if (!parsed.ok) continue;
  const digest = createHash("sha256").update(JSON.stringify(layoutArtwork(parsed.draft.artwork))).digest("hex");
  assert.equal(digest, expected, label);
}

function decodePng(body: Buffer): string | null {
  const image = PNG.sync.read(body);
  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data ?? null;
}

function decodeSvg(svg: string, widthPx: number): string | null {
  const roles = Object.keys(printFonts) as PrintFontRole[];
  const rendered = new Resvg(svg, {
    font: {
      fontFiles: roles.map((role) => fontFile(role)),
      loadSystemFonts: false,
      defaultFontFamily: printFonts.body.family,
    },
    shapeRendering: 1,
    textRendering: 1,
    fitTo: { mode: "width", value: widthPx },
  }).render();
  return decodePng(rendered.asPng());
}

console.log("signage checks passed");
