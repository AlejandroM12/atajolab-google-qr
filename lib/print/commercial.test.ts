import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { COMMERCIAL_ARTWORK_VERSION, commercialTemplates, type CommercialTemplateId } from "../artwork.ts";
import { parseOrderDraft } from "../order-draft.ts";
import { fitText } from "./fit-text.ts";
import { fontFile, printFonts, type PrintFontRole } from "./fonts.ts";
import { layoutArtwork, type DrawCommand } from "./layout.ts";
import { renderArtworkSvg } from "./preview.ts";
import { printPixels, renderArtworkFile } from "./render.ts";

const placeUrl = "https://www.google.com/maps/place/Obelisco/@-34.6037,-58.3816,17z";
const longName = "Taller Electromecánico de la Esquina Norte";
const longSubtitle = "Escaneá y contanos tu experiencia con el equipo, el horario y la atención del local";
const customSubtitle = "Llegá hoy, mirá el local y guardá el recorrido para volver cuando quieras";

const palettes = {
  "minimal-elegant": { fontId: "fraunces", ink: "#1c1915", accent: "#8a7048", surface: "#f3efe6", foreground: "#1c1915", background: "#fffcf8" },
  "dark-premium": { fontId: "fraunces", ink: "#f4efe4", accent: "#d4b483", surface: "#12100e", foreground: "#1a1612", background: "#f7f1e6" },
  "modern-business": { fontId: "source", ink: "#10211c", accent: "#0c6e62", surface: "#f4f6f5", foreground: "#10211c", background: "#ffffff" },
  "creative-pop": { fontId: "sora", ink: "#1d1a17", accent: "#e85d4c", surface: "#fff6ee", foreground: "#1d1a17", background: "#ffffff" },
} as const;

const wrapped = fitText({
  text: longName,
  role: "frauncesBold",
  width: 68,
  maxSize: 8.4,
  minSize: 4.6,
  maxLines: 4,
  leading: 1.28,
});
assert.ok(wrapped);
assert.equal(wrapped.lines.join(" "), longName);
assert.equal(wrapped.lines.some((line) => line.includes("…")), false);
assert.equal(
  fitText({
    text: "W".repeat(40),
    role: "frauncesBold",
    width: 20,
    maxSize: 8,
    minSize: 4.6,
    maxLines: 3,
  }),
  null,
);

function logo(width: number, height: number): string {
  const png = new PNG({ width, height, colorType: 6 });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = 20;
    png.data[index + 1] = 90;
    png.data[index + 2] = 80;
    png.data[index + 3] = 255;
  }
  return PNG.sync.write(png).toString("base64");
}

function piece(templateId: CommercialTemplateId, overrides: Record<string, unknown> = {}) {
  const parsed = parseOrderDraft({
    version: 3,
    goal: "ubicacion",
    url: placeUrl,
    templateId,
    businessName: longName,
    subtitle: longSubtitle,
    qrSize: 320,
    logo: null,
    email: "cliente@example.com",
    ...palettes[templateId],
    ...overrides,
  });
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  if (!parsed.ok || parsed.draft.artwork.version !== COMMERCIAL_ARTWORK_VERSION) throw new Error("commercial");
  return parsed.draft.artwork;
}

const scenes = commercialTemplates.map((template) => layoutArtwork(piece(template.id)));
const signatures = scenes.map((scene) => scene.commands.map((command) => command.type).join(","));
assert.equal(new Set(signatures).size, signatures.length);

for (const template of commercialTemplates) {
  const artwork = piece(template.id, { subtitle: customSubtitle, logo: { data: logo(96, 24) } });
  const scene = layoutArtwork(artwork);
  assert.equal(scene.widthMm, template.widthMm);
  assert.equal(scene.heightMm, template.heightMm);
  const texts = scene.commands.filter((command): command is Extract<DrawCommand, { type: "text" }> => command.type === "text");
  const visible = texts.map((command) => command.text).join(" ");
  assert.equal(visible.includes("…"), false);
  assert.equal(visible.includes(longName), true);
  assert.equal(visible.includes(customSubtitle), true);
  assert.equal(visible.includes("NFC"), false);
  const qr = scene.commands.find((command) => command.type === "qr");
  assert.ok(qr && qr.type === "qr" && qr.size >= 28);
  const image = scene.commands.find((command) => command.type === "image");
  assert.ok(image && image.type === "image" && image.w > image.h * 1.5);

  const tall = piece(template.id, { logo: { data: logo(24, 96) }, businessName: "Panadería Sur", subtitle: customSubtitle });
  const tallImage = layoutArtwork(tall).commands.find((command) => command.type === "image");
  assert.ok(tallImage && tallImage.type === "image" && tallImage.h > tallImage.w * 1.5);

  const svgFile = await renderArtworkFile(artwork, "svg");
  const pngFile = await renderArtworkFile(artwork, "png");
  const pdfFile = await renderArtworkFile(artwork, "pdf");
  const svg = svgFile.body.toString("utf8");
  assert.equal(svg, renderArtworkSvg(artwork));
  assert.equal(svg.includes("…"), false);
  assert.match(svg, new RegExp(`width="${template.widthMm}mm" height="${template.heightMm}mm"`));
  assert.equal(pngFile.body.readUInt32BE(16), printPixels(template.widthMm));
  assert.equal(pngFile.body.readUInt32BE(20), printPixels(template.heightMm));
  const media = pdfFile.body.toString("latin1").match(/\/MediaBox\s*\[\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*\]/);
  assert.ok(media);
  assert.ok(Math.abs((Number(media?.[1]) * 25.4) / 72 - template.widthMm) < 0.2);
  assert.ok(Math.abs((Number(media?.[2]) * 25.4) / 72 - template.heightMm) < 0.2);
  assert.equal(decodePng(pngFile.body), artwork.href);
  assert.equal(decodeSvg(svg, printPixels(template.widthMm)), artwork.href);
  assert.equal(decodePdf(pdfFile.body), artwork.href);
}

const minimal = scenes[0];
const dark = scenes[1];
const modern = scenes[2];
const pop = scenes[3];
assert.ok(minimal && dark && modern && pop);
assert.equal(minimal.commands.filter((command) => command.type === "circle").length, 0);
assert.ok(dark.commands.filter((command) => command.type === "stroke").length >= 6);
assert.ok(dark.commands.some((command) => command.type === "circle"));
assert.ok(modern.commands.some((command) => command.type === "rect" && command.x === 0 && command.w === 6 && command.h === modern.heightMm));
assert.ok(pop.commands.filter((command) => command.type === "circle").length >= 2);
const minimalTitle = largestText(minimal.commands);
const modernTitle = largestText(modern.commands);
assert.equal(minimalTitle?.align, "center");
assert.equal(modernTitle?.align, "left");
assert.equal(largestText(pop.commands)?.align, "left");

function largestText(commands: DrawCommand[]) {
  return commands
    .filter((command): command is Extract<DrawCommand, { type: "text" }> => command.type === "text")
    .sort((left, right) => right.size - left.size)[0];
}

function decodePng(body: Buffer): string | null {
  const image = PNG.sync.read(body);
  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data ?? null;
}

function decodeSvg(svg: string, widthPx: number): string | null {
  const roles = Object.keys(printFonts) as PrintFontRole[];
  const image = new Resvg(svg, {
    font: {
      fontFiles: roles.map((role) => fontFile(role)),
      loadSystemFonts: false,
      defaultFontFamily: printFonts.body.family,
    },
    shapeRendering: 1,
    textRendering: 1,
    fitTo: { mode: "width", value: widthPx },
  }).render();
  return decodePng(image.asPng());
}

function decodePdf(body: Buffer): string | null {
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  for (const stream of pdfStreams(body)) {
    const parts = stream.toString("latin1").split(/\s+/);
    for (let index = 0; index < parts.length; index += 1) {
      if (parts[index] !== "re" || index < 4) continue;
      const x = Number(parts[index - 4]);
      const y = Number(parts[index - 3]);
      const w = Number(parts[index - 2]);
      const h = Number(parts[index - 1]);
      if ([x, y, w, h].some((value) => Number.isNaN(value))) continue;
      if (w < 0.4 || h < 0.4 || w > 8 || h > 8 || Math.abs(w - h) > 0.2) continue;
      rects.push({ x, y, w, h });
    }
  }
  if (rects.length < 100) return null;
  const cell = rects[0]?.w ?? 1;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = 0;
  let maxY = 0;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  }
  const quiet = cell * 4;
  minX -= quiet;
  minY -= quiet;
  maxX += quiet;
  maxY += quiet;
  const scale = 6;
  const pixelW = Math.ceil((maxX - minX) * scale);
  const pixelH = Math.ceil((maxY - minY) * scale);
  const image = new PNG({ width: pixelW, height: pixelH });
  image.data.fill(255);
  for (const rect of rects) {
    const left = Math.round((rect.x - minX) * scale);
    const top = Math.round((maxY - (rect.y + rect.h)) * scale);
    const right = Math.round((rect.x + rect.w - minX) * scale);
    const bottom = Math.round((maxY - rect.y) * scale);
    for (let py = top; py < bottom; py += 1) {
      for (let px = left; px < right; px += 1) {
        const offset = (py * pixelW + px) * 4;
        if (offset < 0 || offset + 3 >= image.data.length) continue;
        image.data[offset] = 0;
        image.data[offset + 1] = 0;
        image.data[offset + 2] = 0;
        image.data[offset + 3] = 255;
      }
    }
  }
  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data ?? null;
}

function pdfStreams(body: Buffer): Buffer[] {
  const streams: Buffer[] = [];
  const source = body.toString("latin1");
  const marker = "stream";
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(marker, cursor);
    if (start < 0) break;
    let dataStart = start + marker.length;
    if (source.charCodeAt(dataStart) === 13) dataStart += 1;
    if (source.charCodeAt(dataStart) === 10) dataStart += 1;
    const end = source.indexOf("endstream", dataStart);
    if (end < 0) break;
    const raw = Buffer.from(source.slice(dataStart, end).replace(/\r?\n$/, ""), "latin1");
    try {
      streams.push(inflateSync(raw));
    } catch {
      streams.push(raw);
    }
    cursor = end + 9;
  }
  return streams;
}

console.log("commercial template checks passed");
