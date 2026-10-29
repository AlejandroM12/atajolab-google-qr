import assert from "node:assert/strict";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { COMMERCIAL_ARTWORK_VERSION, COUNTER_ARTWORK_VERSION, counterTemplates, type CounterTemplateId } from "../artwork.ts";
import { contrastRatio } from "../color.ts";
import { parseOrderDraft } from "../order-draft.ts";
import { fontFile, printFonts, type PrintFontRole } from "./fonts.ts";
import { layoutArtwork, type DrawCommand } from "./layout.ts";
import { printPixels, renderArtworkFile } from "./render.ts";

const placeUrl = "https://www.google.com/maps/place/Obelisco/@-34.6037,-58.3816,17z";
const longName = "Taller Electromecánico de la Esquina Norte";
const phrase = "Encontranos en Google Maps";

const palettes = {
  "google-clean": { fontId: "sora", ink: "#202124", accent: "#1a73e8", surface: "#ffffff", foreground: "#202124", background: "#ffffff" },
  "black-modern": { fontId: "sora", ink: "#f5f6f7", accent: "#9aa0a6", surface: "#101114", foreground: "#101114", background: "#ffffff" },
  "brand-pro": { fontId: "source", ink: "#10211c", accent: "#0f6e62", surface: "#f4f7f6", foreground: "#10211c", background: "#ffffff" },
  "bold-review": { fontId: "sora", ink: "#1a1a1a", accent: "#d93025", surface: "#ffffff", foreground: "#1a1a1a", background: "#ffffff" },
} as const;

function logo(width: number, height: number): string {
  const png = new PNG({ width, height, colorType: 6 });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = 180;
    png.data[index + 1] = 40;
    png.data[index + 2] = 30;
    png.data[index + 3] = 255;
  }
  return PNG.sync.write(png).toString("base64");
}

function piece(templateId: CounterTemplateId, overrides: Record<string, unknown> = {}) {
  const parsed = parseOrderDraft({
    version: 4,
    goal: "ubicacion",
    url: placeUrl,
    templateId,
    businessName: longName,
    subtitle: phrase,
    qrSize: 256,
    logo: null,
    email: "cliente@example.com",
    ...palettes[templateId],
    ...overrides,
  });
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  if (!parsed.ok || parsed.draft.artwork.version !== COUNTER_ARTWORK_VERSION) throw new Error("counter");
  return parsed.draft.artwork;
}

function textsOf(commands: DrawCommand[]) {
  return commands.filter((command): command is Extract<DrawCommand, { type: "text" }> => command.type === "text");
}

for (const template of counterTemplates) {
  const artwork = piece(template.id);
  const scene = layoutArtwork(artwork);
  assert.equal(scene.widthMm, template.widthMm);
  assert.equal(scene.heightMm, template.heightMm);
  const texts = textsOf(scene.commands);
  const visible = texts.map((command) => command.text).join(" ");
  assert.equal(visible.includes("…"), false);
  assert.equal(visible.includes("NFC"), false);
  assert.equal(visible.includes(longName), true);
  assert.equal(visible.includes(phrase), true);
  assert.equal(scene.commands.some((command) => command.type === "image"), false);
  const qr = scene.commands.find((command) => command.type === "qr");
  assert.ok(qr && qr.type === "qr" && qr.size >= 48);
  const pngFile = await renderArtworkFile(artwork, "png");
  assert.equal(pngFile.body.readUInt32BE(16), printPixels(template.widthMm));
  assert.equal(decodePng(pngFile.body), artwork.href);
}

const clean = layoutArtwork(piece("google-clean"));
const cleanAccent = clean.commands.filter((command) => command.type === "rect" && command.fill === "#1a73e8");
assert.ok(cleanAccent.length > 0);
assert.ok(cleanAccent.every((command) => command.type === "rect" && command.h <= 1.2));

const modern = layoutArtwork(piece("black-modern"));
assert.equal(textsOf(modern.commands).some((command) => /nfc/i.test(command.text)), false);

const branded = layoutArtwork(piece("brand-pro"));
assert.equal(branded.commands.some((command) => command.type === "image"), false);
const footer = textsOf(branded.commands).find((command) => command.color !== "#10211c");
assert.ok(footer);
assert.ok(contrastRatio(footer.color, "#0f6e62") >= 4.5);

const withLogo = layoutArtwork(piece("brand-pro", { logo: { data: logo(80, 80) } }));
const image = withLogo.commands.find((command) => command.type === "image");
assert.ok(image && image.type === "image" && image.w >= 20 && image.h >= 20);

const bold = layoutArtwork(piece("bold-review"));
const header = bold.commands.find((command) => command.type === "rect" && command.fill === "#1a1a1a" && command.h < bold.heightMm);
assert.ok(header && header.type === "rect" && header.h <= 38);
const boldSizes = textsOf(bold.commands).map((command) => command.size);
const actionSize = Math.max(...boldSizes);
const nameSize = Math.min(...boldSizes);
assert.ok(actionSize - nameSize <= 1.6);

const svg = (await renderArtworkFile(piece("google-clean"), "svg")).body.toString("utf8");
assert.equal(decodeSvg(svg, printPixels(90)), placeUrl);

const storedV3 = parseOrderDraft({
  version: 3,
  goal: "ubicacion",
  url: placeUrl,
  templateId: "dark-premium",
  businessName: "Taller Electromecánica Morel",
  subtitle: phrase,
  fontId: "fraunces",
  ink: "#f4efe4",
  accent: "#d4b483",
  surface: "#12100e",
  foreground: "#1a1612",
  background: "#f7f1e6",
  qrSize: 256,
  logo: null,
  email: "cliente@example.com",
});
assert.equal(storedV3.ok, true);
if (!storedV3.ok || storedV3.draft.artwork.version !== COMMERCIAL_ARTWORK_VERSION) throw new Error("v3");
const frozen = layoutArtwork(storedV3.draft.artwork);
assert.ok(frozen.commands.some((command) => command.type === "stroke"));

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

console.log("counter checks passed");
