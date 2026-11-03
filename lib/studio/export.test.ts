import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { addImage, addRect, moveLayer, updateElement } from "@/lib/studio/document";
import { fontFile, printFonts, type PrintFontRole } from "@/lib/print/fonts";
import { studioExportAllowed } from "@/lib/studio/export/access";
import { compileStudioScene } from "@/lib/studio/export/compile";
import { exportStudioDesign } from "@/lib/studio/export/index";
import { STUDIO_QR_MARGIN_MODULES, studioQrLayout } from "@/lib/studio/export/qr";
import { renderStudioSvg } from "@/lib/studio/export/render";
import { studioPrintPixels } from "@/lib/studio/export/units";
import { validateForExport } from "@/lib/studio/export/validate";
import { wrapStudioText } from "@/lib/studio/export/wrap";
import { createDocument } from "@/lib/studio/templates";
import type { DesignDocumentV8 } from "@/lib/studio/types";

const PLACE_URL = "https://www.google.com/maps/place/Obelisco/@-34.6037,-58.3816,17z";
const REVIEW_URL = "https://example.com/verde-vivo";

function withQrUrl(document: DesignDocumentV8, url: string): DesignDocumentV8 {
  const qr = document.elements.find((element) => element.type === "qr");
  assert.ok(qr);
  return updateElement(document, qr.id, { value: url });
}

function logo(width: number, height: number, alpha = 255): string {
  const png = new PNG({ width, height, colorType: 6 });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = 20;
    png.data[index + 1] = 90;
    png.data[index + 2] = 80;
    png.data[index + 3] = alpha;
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString("base64")}`;
}

function corporateSample(): DesignDocumentV8 {
  let document = withQrUrl(createDocument("corporativo"), PLACE_URL);
  document = updateElement(document, document.elements.find((el) => el.role === "titulo")!.id, {
    text: "Norte Técnica",
  });
  document = updateElement(document, document.elements.find((el) => el.role === "rubro")!.id, {
    text: "Servicio técnico",
  });
  document = updateElement(document, document.elements.find((el) => el.role === "bajada")!.id, {
    text: "Reparación, mantenimiento y repuestos con seguimiento.",
  });
  document = updateElement(document, document.elements.find((el) => el.role === "ayuda")!.id, {
    text: "Escaneá para dejar tu reseña",
  });
  const mark = addImage(document, "logo-norte", logo(240, 240), "norte-mark", 240, 240);
  assert.ok(mark);
  document = updateElement(mark, "logo-norte", { x: 10, y: 88, width: 18, height: 18, rotation: 0 });
  const stamp = addImage(document, "logo-sello", logo(180, 180, 200), "sello", 180, 180);
  assert.ok(stamp);
  document = updateElement(stamp, "logo-sello", { x: 32, y: 88, width: 16, height: 16, rotation: -8 });
  return document;
}

function creativeSample(): DesignDocumentV8 {
  let document = withQrUrl(createDocument("creativo"), REVIEW_URL);
  document = updateElement(document, document.elements.find((el) => el.role === "titulo")!.id, {
    text: "Verde Vivo Studio",
  });
  document = updateElement(document, document.elements.find((el) => el.role === "bajada")!.id, {
    text: "Seguinos y escaneá para ver el menú.",
  });
  const brand = addImage(document, "logo-verde", logo(320, 320), "verde-vivo", 320, 320);
  assert.ok(brand);
  document = updateElement(brand, "logo-verde", { x: 14, y: 70, width: 28, height: 28, rotation: 0 });
  const accent = addRect(document, "deco-1");
  document = updateElement(accent, "deco-1", {
    x: 78,
    y: 72,
    width: 16,
    height: 16,
    rotation: 18,
    fill: "#94d2bd",
    cornerRadius: 4,
  });
  return document;
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
  if (rects.length < 80) return null;
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
    let payload = Buffer.from(source.slice(dataStart, end), "latin1");
    if (source.includes("/FlateDecode", start > 80 ? start - 80 : 0)) {
      try {
        payload = inflateSync(payload);
      } catch {
        /* keep raw */
      }
    }
    streams.push(payload);
    cursor = end + 9;
  }
  return streams;
}

const emptyCorporate = createDocument("corporativo");
assert.equal(validateForExport(emptyCorporate).ready, false);
assert.ok(validateForExport(emptyCorporate).errors.some((issue) => issue.code === "qr-empty"));

const corporate = corporateSample();
const creative = creativeSample();
assert.equal(validateForExport(corporate).ready, true);
assert.equal(validateForExport(creative).ready, true);

const covered = (() => {
  const qr = corporate.elements.find((element) => element.type === "qr")!;
  const next = addRect(corporate, "cover-export");
  const placed = updateElement(next, "cover-export", {
    x: qr.x,
    y: qr.y,
    width: qr.width,
    height: qr.height,
    fill: "#ff0000",
  });
  return moveLayer(placed, "cover-export", "up");
})();
assert.equal(validateForExport(covered).ready, false);
assert.ok(validateForExport(covered).errors.some((issue) => issue.code === "qr-covered"));

const lowRes = (() => {
  const tiny = addImage(corporate, "tiny-logo", logo(8, 8), "pixel", 8, 8);
  assert.ok(tiny);
  return updateElement(tiny, "tiny-logo", { x: 8, y: 8, width: 40, height: 40 });
})();
assert.ok(validateForExport(lowRes).warnings.some((issue) => issue.code === "low-res-image"));
assert.equal(validateForExport(lowRes).ready, true);

for (const sample of [
  { name: "corporativo", document: corporate, url: PLACE_URL },
  { name: "creativo", document: creative, url: REVIEW_URL },
]) {
  const scene = compileStudioScene(sample.document);
  assert.equal(scene.widthMm, 105);
  assert.equal(scene.heightMm, 148);
  assert.ok(scene.commands.some((command) => command.type === "qr"));
  assert.ok(scene.commands.some((command) => command.type === "text"));
  assert.ok(scene.commands.some((command) => command.type === "image"));

  const svgA = renderStudioSvg(scene, "mm");
  const svgB = renderStudioSvg(scene, "mm");
  assert.equal(svgA, svgB);
  assert.match(svgA, /width="105mm"/);
  assert.match(svgA, /height="148mm"/);
  assert.match(svgA, /@font-face/);
  assert.match(svgA, /shape-rendering="crispEdges"/);
  assert.equal(decodeSvg(svgA, studioPrintPixels(105)), sample.url);

  const png = await exportStudioDesign(sample.document, "png");
  assert.equal(png.ok, true);
  if (!png.ok) throw new Error("png");
  const image = PNG.sync.read(png.body);
  assert.equal(image.width, studioPrintPixels(105));
  assert.equal(image.height, studioPrintPixels(148));
  assert.equal(decodePng(png.body), sample.url);

  const svgFile = await exportStudioDesign(sample.document, "svg");
  assert.equal(svgFile.ok, true);
  if (!svgFile.ok) throw new Error("svg");
  assert.equal(svgFile.body.toString("utf8"), svgA);

  const pdf = await exportStudioDesign(sample.document, "pdf");
  assert.equal(pdf.ok, true);
  if (!pdf.ok) throw new Error("pdf");
  assert.equal(pdf.body.subarray(0, 4).toString("latin1"), "%PDF");
  assert.equal(decodePdf(pdf.body), sample.url);

  const blocked = await exportStudioDesign(covered, "png");
  assert.equal(blocked.ok, false);
  if (blocked.ok) throw new Error("blocked");
  assert.equal(blocked.error, "not-ready");

  const qrCommand = scene.commands.find((command) => command.type === "qr");
  assert.ok(qrCommand && qrCommand.type === "qr");
  const layout = studioQrLayout(qrCommand.href, qrCommand.size);
  assert.equal(STUDIO_QR_MARGIN_MODULES, 4);
  assert.ok(layout.quietMm >= qrCommand.size * 0.08);
  const pathMatch = /shape-rendering="crispEdges" d="M([\d.]+) ([\d.]+)/.exec(svgA);
  assert.ok(pathMatch);
  const firstModuleX = Number(pathMatch[1]);
  const firstModuleY = Number(pathMatch[2]);
  assert.ok(firstModuleX >= qrCommand.x + layout.quietMm - 0.05);
  assert.ok(firstModuleY >= qrCommand.y + layout.quietMm - 0.05);
}

const shortWrap = wrapStudioText({ text: "Hola", font: "source", fontSize: 4, width: 40 });
assert.deepEqual(shortWrap.lines, ["Hola"]);

const longWrap = wrapStudioText({
  text: "Reparación, mantenimiento y repuestos con seguimiento para el local.",
  font: "source",
  fontSize: 4,
  width: 40,
});
assert.ok(longWrap.lines.length >= 2);
assert.equal(longWrap.lines.join(" ").includes("…"), false);

const multiWrap = wrapStudioText({
  text: "Primera línea\nSegunda línea con más palabras para forzar un salto",
  font: "sora",
  fontSize: 5,
  width: 36,
});
assert.ok(multiWrap.lines[0] === "Primera línea");
assert.ok(multiWrap.lines.length >= 3);

assert.equal(studioExportAllowed({ NODE_ENV: "development" }), true);
assert.equal(studioExportAllowed({ NODE_ENV: "production" }), false);
assert.equal(studioExportAllowed({ NODE_ENV: "production", STUDIO_EXPORT_ENABLED: "true" }), true);
assert.equal(studioExportAllowed({ NODE_ENV: "development", STUDIO_EXPORT_ENABLED: "false" }), false);

console.log("studio export ok");
