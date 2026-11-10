import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { fontFile, printFonts, svgFontFamily, type PrintFontRole } from "./fonts.ts";
import { exportStudioDesign } from "../studio/export/index.ts";
import { updateElement } from "../studio/document.ts";
import { createDocument } from "../studio/templates.ts";
import type { StudioFont } from "../studio/types.ts";

const require = createRequire(import.meta.url);
const fontkit = require("fontkit") as {
  openSync(file: string): {
    familyName: string;
    name?: { records?: { preferredFamily?: { en?: string } } };
    "OS/2": { usWeightClass: number };
  };
};

const roles = Object.keys(printFonts) as PrintFontRole[];

// 1. Each role names the family and weight its TTF declares (what resvg matches on).
for (const role of roles) {
  const font = fontkit.openSync(fontFile(role));
  const family = font.name?.records?.preferredFamily?.en ?? font.familyName;
  assert.equal(printFonts[role].family, family, `${role}: family must match the TTF`);
  assert.equal(printFonts[role].weight, font["OS/2"].usWeightClass, `${role}: weight must match the TTF`);
}

// 2. SVG attribute values are quoted, so browsers keep "Source Sans 3".
assert.equal(svgFontFamily("Source Sans 3"), "'Source Sans 3'");
assert.equal(svgFontFamily("Fra'unces"), "'Fraunces'");

// 3. resvg really draws every role with its own font (no silent fallback to the body font).
function renderRole(role: PrintFontRole): Buffer {
  const { family, weight } = printFonts[role];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="80"><rect width="600" height="80" fill="#fff"/><text x="10" y="58" font-family="${svgFontFamily(family)}" font-weight="${weight}" font-size="48" fill="#000">Café del Centro QR</text></svg>`;
  return new Resvg(svg, {
    font: {
      fontFiles: roles.map((r) => fontFile(r)),
      loadSystemFonts: false,
      defaultFontFamily: printFonts.body.family,
      sansSerifFamily: printFonts.body.family,
    },
  }).render().asPng();
}
const renders = new Map(roles.map((role) => [role, renderRole(role)]));
for (const role of roles) {
  if (role === "body") continue;
  assert.equal(renders.get(role)!.equals(renders.get("body")!), false, `${role} must not fall back to Source Sans`);
}
assert.equal(renders.get("sora")!.equals(renders.get("display")!), false, "Sora 500 and 600 differ");
assert.equal(renders.get("fraunces")!.equals(renders.get("frauncesBold")!), false, "Fraunces 500 and 600 differ");

// 4. Studio downloads keep the font chosen in the editor, in PNG, SVG and PDF.
const QR_URL = "https://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnop";
function studioDocument(font: StudioFont) {
  const base = createDocument("clasico");
  const qr = base.elements.find((element) => element.type === "qr");
  assert.ok(qr);
  let document = updateElement(base, qr.id, { value: QR_URL });
  for (const element of document.elements) {
    if (element.type === "text") document = updateElement(document, element.id, { font });
  }
  return document;
}
async function exported(font: StudioFont, format: "png" | "svg" | "pdf"): Promise<Buffer> {
  const result = await exportStudioDesign(studioDocument(font), format);
  assert.equal(result.ok, true, `${font} ${format} export`);
  return result.ok ? result.body : Buffer.alloc(0);
}

const sourcePng = await exported("source", "png");
assert.equal((await exported("fraunces", "png")).equals(sourcePng), false, "PNG keeps Fraunces");
assert.equal((await exported("sora", "png")).equals(sourcePng), false, "PNG keeps Sora");

for (const font of ["source", "sora", "fraunces"] as const) {
  const svg = (await exported(font, "svg")).toString("utf8");
  const attributes = [...svg.matchAll(/<text [^>]*font-family="([^"]*)"/g)].map((match) => match[1]);
  assert.ok(attributes.length > 0, `${font} SVG has text`);
  const declared = new Set([...svg.matchAll(/@font-face\{font-family:"([^"]+)"/g)].map((match) => match[1]));
  for (const value of attributes) {
    assert.match(value, /^'[^']+'$/, `${font} SVG font-family is quoted`);
    assert.ok(declared.has(value.slice(1, -1)), `${font} SVG embeds ${value}`);
  }
}

const pdfFonts = (pdf: Buffer) => [...pdf.toString("latin1").matchAll(/\/BaseFont\s*\/[A-Z]{6}\+([A-Za-z0-9-]+)/g)].map((m) => m[1]);
assert.ok(pdfFonts(await exported("fraunces", "pdf")).some((name) => name.startsWith("Fraunces")), "PDF embeds Fraunces");
assert.ok(pdfFonts(await exported("sora", "pdf")).some((name) => name.startsWith("Sora")), "PDF embeds Sora");

console.log("font checks passed");
