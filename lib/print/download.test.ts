import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { templateSpec, type ProductArtworkV2, type StudioTemplateId } from "../artwork.ts";
import { parseOrderDraft } from "../order-draft.ts";
import { createDeliveryKey, hashDeliveryKey } from "../payments/access.ts";
import { fontFile, printFonts, type PrintFontRole } from "./fonts.ts";
import { artworkFilename, contentDisposition, resolveArtworkDownload, type DownloadOrder } from "./download.ts";
import { layoutArtwork } from "./layout.ts";
import { printPixels, renderArtworkFile } from "./render.ts";

const placeUrl = "https://www.google.com/maps/place/Obelisco/@-34.6037,-58.3816,17z";
const publicId = "aaaaaaaaaaaaaaaaaaaaaaaa";

function artwork(overrides: Record<string, unknown> = {}) {
  const parsed = parseOrderDraft({
    goal: "ubicacion",
    url: placeUrl,
    templateId: "tarjeta-resena",
    businessName: "Café del Centro",
    headline: "Escaneá para ver cómo llegar",
    foreground: "#14221f",
    background: "#ffffff",
    qrSize: 320,
    email: "cliente@example.com",
    ...overrides,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("draft");
  return parsed.draft.artwork;
}

function order(status: DownloadOrder["status"], piece = artwork()): DownloadOrder {
  return {
    publicId,
    status,
    artwork: piece,
    deliveryKeyHash: hashDeliveryKey(key),
  };
}

const key = createDeliveryKey();

{
  const paid = order("PAID");
  const allowed = resolveArtworkDownload({
    publicId,
    format: "png",
    deliveryKey: key,
    order: paid,
  });
  assert.equal(allowed.ok, true);
  if (allowed.ok) assert.equal(allowed.artwork.businessName, "Café del Centro");

  assert.deepEqual(
    resolveArtworkDownload({ publicId, format: "svg", deliveryKey: null, order: paid }),
    { ok: false, status: 403, error: "download-unavailable" },
  );
  assert.deepEqual(
    resolveArtworkDownload({
      publicId,
      format: "pdf",
      deliveryKey: createDeliveryKey(),
      order: paid,
    }),
    { ok: false, status: 403, error: "download-unavailable" },
  );
  assert.deepEqual(
    resolveArtworkDownload({ publicId, format: "png", deliveryKey: key, order: order("PENDING") }),
    { ok: false, status: 403, error: "download-unavailable" },
  );
  assert.deepEqual(
    resolveArtworkDownload({ publicId, format: "png", deliveryKey: key, order: order("CANCELLED") }),
    { ok: false, status: 403, error: "download-unavailable" },
  );
  assert.deepEqual(
    resolveArtworkDownload({ publicId, format: "png", deliveryKey: key, order: null }),
    { ok: false, status: 404, error: "not-found" },
  );
  assert.deepEqual(
    resolveArtworkDownload({ publicId: "corta", format: "png", deliveryKey: key, order: paid }),
    { ok: false, status: 404, error: "not-found" },
  );
  assert.deepEqual(
    resolveArtworkDownload({ publicId, format: "gif", deliveryKey: key, order: paid }),
    { ok: false, status: 404, error: "not-found" },
  );
}

{
  const name = artworkFilename("tarjeta-resena", "Café del Centro", "pdf");
  assert.equal(name, "tarjeta-resena-cafe-del-centro.pdf");
  assert.equal(name.includes("/"), false);
  assert.equal(contentDisposition(name).startsWith("attachment;"), true);
  assert.equal(contentDisposition(name).includes("filename="), true);
}

{
  const piece = artwork();
  const scene = layoutArtwork(piece);
  const spec = templateSpec(piece.templateId);
  assert.equal(scene.widthMm, spec.widthMm);
  assert.equal(scene.heightMm, spec.heightMm);

  const small = layoutArtwork(artwork({ qrSize: 192 }));
  const large = layoutArtwork(artwork({ qrSize: 320 }));
  const qr = (value: ReturnType<typeof layoutArtwork>) => value.commands.find((command) => command.type === "qr");
  const smallQr = qr(small);
  const largeQr = qr(large);
  assert.equal(smallQr?.type, "qr");
  assert.equal(largeQr?.type, "qr");
  if (smallQr?.type === "qr" && largeQr?.type === "qr") {
    assert.equal(smallQr.href, piece.href);
    assert.ok(smallQr.size < largeQr.size);
    assert.equal(smallQr.foreground, "#14221f");
    assert.equal(smallQr.background, "#ffffff");
  }
}

for (const templateId of ["tarjeta-resena", "cartel-ubicacion", "sticker"] as const) {
  const piece = artwork({ templateId, businessName: "AtajoLab", headline: "Encontranos en Google Maps" });
  const spec = templateSpec(templateId);
  const svgFile = await renderArtworkFile(piece, "svg");
  const pdfFile = await renderArtworkFile(piece, "pdf");
  const pngFile = await renderArtworkFile(piece, "png");
  const svg = svgFile.body.toString("utf8");

  assert.equal(svgFile.mime, "image/svg+xml");
  assert.equal(pdfFile.mime, "application/pdf");
  assert.equal(pngFile.mime, "image/png");
  assert.match(svg, new RegExp(`width="${spec.widthMm}mm" height="${spec.heightMm}mm"`));
  assert.match(svg, new RegExp(`viewBox="0 0 ${spec.widthMm} ${spec.heightMm}"`));
  assert.equal(svg.includes("AtajoLab"), true);
  assert.equal(svg.includes("Encontranos en Google Maps"), true);
  assert.equal(svg.includes("#14221f"), true);
  assert.equal(svg.includes("Otro negocio"), false);

  // PDF metadata carries the product name; the library keeps its own Producer.
  assert.equal(pdfInfoString(pdfFile.body, "Creator"), "AtajoLab QR");
  assert.equal(pdfInfoString(pdfFile.body, "Producer"), "PDFKit");
  assert.equal(pdfFile.body.toString("latin1").includes("Google QR"), false);

  const media = pdfFile.body.toString("latin1").match(/\/MediaBox\s*\[\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*\]/);
  assert.ok(media);
  const widthMm = (Number(media?.[1]) * 25.4) / 72;
  const heightMm = (Number(media?.[2]) * 25.4) / 72;
  assert.ok(Math.abs(widthMm - spec.widthMm) < 0.2);
  assert.ok(Math.abs(heightMm - spec.heightMm) < 0.2);

  assert.equal(pngFile.body.readUInt32BE(16), printPixels(spec.widthMm));
  assert.equal(pngFile.body.readUInt32BE(20), printPixels(spec.heightMm));
}

function solidLogo(): string {
  const png = new PNG({ width: 32, height: 32, colorType: 6 });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = 180;
    png.data[index + 1] = 48;
    png.data[index + 2] = 36;
    png.data[index + 3] = 255;
  }
  return PNG.sync.write(png).toString("base64");
}

const logoData = solidLogo();

function studioPiece(templateId: StudioTemplateId, overrides: Record<string, unknown> = {}) {
  const palettes = {
    "minimal-elegance": { fontId: "fraunces", ink: "#1c1915", accent: "#8d7350", surface: "#f7f4ee", foreground: "#1c1915", background: "#ffffff" },
    "dark-premium": { fontId: "sora", ink: "#f6f1e7", accent: "#c6a36a", surface: "#161311", foreground: "#1a1612", background: "#f7f1e6" },
    "brand-identity": { fontId: "source", ink: "#14221f", accent: "#0f6e62", surface: "#fbfaf7", foreground: "#14221f", background: "#ffffff" },
  } as const;
  const parsed = parseOrderDraft({
    goal: "resena",
    url: "https://search.google.com/local/writereview?placeid=ChIJabcdefghij",
    templateId,
    businessName: "Panadería Sur",
    subtitle: "Contanos cómo te atendimos",
    qrSize: 256,
    logo: templateId === "brand-identity" ? { data: logoData } : null,
    email: "cliente@example.com",
    ...palettes[templateId],
    ...overrides,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.draft.artwork.version !== 2) throw new Error("studio");
  return parsed.draft.artwork;
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

/** Reads a string entry of the PDF Info dictionary, inline or by indirect reference. */
function pdfInfoString(body: Buffer, key: string): string | null {
  const text = body.toString("latin1");
  const inline = text.match(new RegExp(`/${key}\\s*\\(([^)]*)\\)`));
  if (inline) return inline[1];
  const ref = text.match(new RegExp(`/${key}\\s+(\\d+)\\s+0\\s+R`));
  if (!ref) return null;
  const value = text.match(new RegExp(`(?:^|\\n)${ref[1]}\\s+0\\s+obj\\s*\\(([^)]*)\\)`));
  return value ? value[1] : null;
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

{
  const pending = studioPiece("minimal-elegance");
  assert.deepEqual(
    resolveArtworkDownload({ publicId, format: "png", deliveryKey: key, order: order("PENDING", pending) }),
    { ok: false, status: 403, error: "download-unavailable" },
  );
  assert.deepEqual(
    resolveArtworkDownload({
      publicId,
      format: "svg",
      deliveryKey: createDeliveryKey(),
      order: order("PAID", pending),
    }),
    { ok: false, status: 403, error: "download-unavailable" },
  );
}

for (const templateId of ["minimal-elegance", "dark-premium", "brand-identity"] as const) {
  const piece = studioPiece(templateId);
  const paid = resolveArtworkDownload({
    publicId,
    format: "pdf",
    deliveryKey: key,
    order: order("PAID", piece),
  });
  assert.equal(paid.ok, true);
  const spec = templateSpec(templateId);
  const svgFile = await renderArtworkFile(piece, "svg");
  const pdfFile = await renderArtworkFile(piece, "pdf");
  const pngFile = await renderArtworkFile(piece, "png");
  const svg = svgFile.body.toString("utf8");

  assert.equal(svgFile.mime, "image/svg+xml");
  assert.equal(pdfFile.mime, "application/pdf");
  assert.equal(pngFile.mime, "image/png");
  assert.match(svg, new RegExp(`width="${spec.widthMm}mm" height="${spec.heightMm}mm"`));
  const visible = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((match) => match[1] ?? "").join("\n");
  assert.equal(visible.includes("Panadería Sur"), true);
  assert.equal(visible.includes("Contanos cómo te atendimos"), true);
  assert.equal(visible.includes("RESEÑA EN GOOGLE"), true);
  assert.equal(visible.includes("NFC"), false);
  assert.equal(svg.includes(piece.surface), true);
  assert.equal(svg.includes(piece.ink), true);
  assert.equal(pngFile.body.readUInt32BE(16), printPixels(spec.widthMm));
  assert.equal(pngFile.body.readUInt32BE(20), printPixels(spec.heightMm));

  const media = pdfFile.body.toString("latin1").match(/\/MediaBox\s*\[\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*\]/);
  assert.ok(media);
  assert.ok(Math.abs((Number(media?.[1]) * 25.4) / 72 - spec.widthMm) < 0.2);
  assert.ok(Math.abs((Number(media?.[2]) * 25.4) / 72 - spec.heightMm) < 0.2);

  assert.equal(decodePng(pngFile.body), piece.href);
  assert.equal(decodeSvg(svg, printPixels(spec.widthMm)), piece.href);
  assert.equal(decodePdf(pdfFile.body), piece.href);

  if (templateId === "minimal-elegance") {
    assert.equal(svg.includes("Fraunces Medium"), true);
    assert.equal(svg.includes("<image "), false);
  }
  if (templateId === "dark-premium") assert.equal(svg.includes("Sora Medium"), true);
  if (templateId === "brand-identity") {
    assert.equal(svg.includes("Source Sans 3 SemiBold"), true);
    assert.equal(svg.includes(`data:image/png;base64,${logoData.slice(0, 48)}`), true);
    assert.equal(svg.includes("ESCANE"), true);
  }
}

{
  const longName = "Taller Electromecánico de la Esquina Norte";
  const longSubtitle = "Escaneá y contanos tu experiencia con el equipo, el horario y la atención del local";
  const piece = studioPiece("dark-premium", { businessName: longName, subtitle: longSubtitle, qrSize: 320 });
  const pngFile = await renderArtworkFile(piece, "png");
  const svg = (await renderArtworkFile(piece, "svg")).body.toString("utf8");
  assert.equal(decodePng(pngFile.body), piece.href);
  const visible = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((match) => match[1] ?? "").join("\n");
  assert.equal(visible.includes("Taller"), true);
  assert.equal(visible.includes(longSubtitle) || visible.includes("…"), true);
}

{
  const piece = studioPiece("minimal-elegance");
  const broken: ProductArtworkV2 = {
    ...piece,
    logo: { mime: "image/png", width: 32, height: 32, data: "a".repeat(64) },
  };
  await assert.rejects(() => renderArtworkFile(broken, "svg"), /artwork-logo/);
}

{
  const piece = artwork({ templateId: "sticker", qrSize: 320 });
  const pngFile = await renderArtworkFile(piece, "png");
  const image = PNG.sync.read(pngFile.body);
  const decoded = jsQR(new Uint8ClampedArray(image.data), image.width, image.height);
  assert.equal(decoded?.data, piece.href);
}

console.log("artwork download checks passed");
