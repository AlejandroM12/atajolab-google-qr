import { Resvg } from "@resvg/resvg-js";
import PDFDocument from "pdfkit";
import { artworkExportFormats, type ArtworkExportFormat, type ProductArtwork } from "@/lib/artwork";
import { fontFaceCss, fontFile, printFonts, svgFontFamily, type PrintFontRole } from "@/lib/print/fonts";
import { layoutArtwork, type ArtworkScene, type DrawCommand } from "@/lib/print/layout";
import { QR_QUIET_ZONE, qrMatrix } from "@/lib/print/qr-matrix";

export const PRINT_DPI = 300;
const MM_TO_PT = 72 / 25.4;

const mimeTypes: Record<ArtworkExportFormat, string> = {
  png: "image/png",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

export function printPixels(mm: number): number {
  return Math.round((mm / 25.4) * PRINT_DPI);
}

export function isArtworkFormat(value: string): value is ArtworkExportFormat {
  return artworkExportFormats.some((format) => format === value);
}

export async function renderArtworkFile(
  artwork: ProductArtwork,
  format: ArtworkExportFormat,
): Promise<{ body: Buffer; mime: string }> {
  const scene = layoutArtwork(artwork);
  const body =
    format === "svg" ? Buffer.from(renderSvg(scene, "mm"), "utf8")
    : format === "pdf" ? await renderPdf(scene)
    : renderPng(scene);

  return { body, mime: mimeTypes[format] };
}

export function renderSvg(scene: ArtworkScene, unit: "mm" | "px"): string {
  const width = unit === "mm" ? `${scene.widthMm}mm` : String(printPixels(scene.widthMm));
  const height = unit === "mm" ? `${scene.heightMm}mm` : String(printPixels(scene.heightMm));
  const clip = scene.clipRadius
    ? `<defs><clipPath id="sheet"><rect width="${num(scene.widthMm)}" height="${num(scene.heightMm)}" rx="${num(scene.clipRadius)}" ry="${num(scene.clipRadius)}"/></clipPath></defs>`
    : "";
  const body = scene.commands.map((command, index) => drawSvg(command, index)).join("");
  const group = scene.clipRadius ? `<g clip-path="url(#sheet)">${body}</g>` : body;

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${num(scene.widthMm)} ${num(scene.heightMm)}"><style>${fontFaceCss(usedFontRoles(scene))}</style>${clip}${group}</svg>`;
}

function renderPng(scene: ArtworkScene): Buffer {
  const svg = renderSvg(scene, "px");
  const roles = usedFontRoles(scene);
  const image = new Resvg(svg, {
    font: {
      fontFiles: roles.map((role) => fontFile(role)),
      loadSystemFonts: false,
      defaultFontFamily: printFonts.body.family,
      sansSerifFamily: printFonts.body.family,
    },
    shapeRendering: 1,
    textRendering: 1,
    fitTo: { mode: "width", value: printPixels(scene.widthMm) },
  }).render();
  const png = image.asPng();
  if (image.width !== printPixels(scene.widthMm) || image.height !== printPixels(scene.heightMm)) {
    throw new Error("artwork-png-size");
  }
  return png;
}

function renderPdf(scene: ArtworkScene): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [pt(scene.widthMm), pt(scene.heightMm)],
      margin: 0,
      info: { Creator: "AtajoLab QR" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (scene.clipRadius) {
      doc.roundedRect(0, 0, pt(scene.widthMm), pt(scene.heightMm), pt(scene.clipRadius)).clip();
    }
    for (const command of scene.commands) drawPdf(doc, command);
    doc.end();
  });
}

function drawSvg(command: DrawCommand, index: number): string {
  if (command.type === "rect") {
    const radius = command.radius ? ` rx="${num(command.radius)}" ry="${num(command.radius)}"` : "";
    return `<rect x="${num(command.x)}" y="${num(command.y)}" width="${num(command.w)}" height="${num(command.h)}" fill="${command.fill}"${radius}${alpha(command.opacity)}/>`;
  }
  if (command.type === "stroke") {
    const radius = command.radius ? ` rx="${num(command.radius)}" ry="${num(command.radius)}"` : "";
    return `<rect x="${num(command.x)}" y="${num(command.y)}" width="${num(command.w)}" height="${num(command.h)}" fill="none" stroke="${command.color}" stroke-width="${num(command.width)}"${radius}${alpha(command.opacity)}/>`;
  }
  if (command.type === "circle") {
    const fill = command.fill ? ` fill="${command.fill}"` : ` fill="none"`;
    const stroke = command.stroke ? ` stroke="${command.stroke}" stroke-width="${num(command.strokeWidth ?? 0)}"` : "";
    return `<circle cx="${num(command.cx)}" cy="${num(command.cy)}" r="${num(command.r)}"${fill}${stroke}${alpha(command.opacity)}/>`;
  }
  if (command.type === "text") {
    const family = printFonts[command.role].family;
    const weight = printFonts[command.role].weight;
    const anchor = command.align === "center" ? "middle" : "start";
    const x = command.align === "center" ? command.x + command.width / 2 : command.x;
    const spacing = command.letterSpacing ? ` letter-spacing="${num(command.size * command.letterSpacing)}"` : "";
    const opacity = command.opacity !== undefined && command.opacity < 1 ? ` fill-opacity="${num(command.opacity)}"` : "";
    return `<text x="${num(x)}" y="${num(command.y)}" font-family="${svgFontFamily(family)}" font-weight="${weight}" font-size="${num(command.size)}" fill="${command.color}" text-anchor="${anchor}" dominant-baseline="hanging"${spacing}${opacity}>${xml(command.text)}</text>`;
  }
  if (command.type === "image") {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(command.data)) throw new Error("artwork-logo");
    const id = `mark-${index}`;
    return `<clipPath id="${id}"><rect x="${num(command.x)}" y="${num(command.y)}" width="${num(command.w)}" height="${num(command.h)}" rx="${num(command.radius)}" ry="${num(command.radius)}"/></clipPath><image href="data:image/png;base64,${command.data}" x="${num(command.x)}" y="${num(command.y)}" width="${num(command.w)}" height="${num(command.h)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`;
  }
  if (command.type === "star") return starSvg(command);
  return qrSvg(command);
}

const STAR_PATH = "M0-1 L0.22-0.31 H0.95 L0.36 0.09 L0.59 0.81 L0 0.38 L-0.59 0.81 L-0.36 0.09 L-0.95-0.31 H-0.22 Z";

function starSvg(command: Extract<DrawCommand, { type: "star" }>): string {
  return `<path d="${STAR_PATH}" fill="${command.fill}" transform="translate(${num(command.cx)} ${num(command.cy)}) scale(${num(command.r)})"/>`;
}

function qrSvg(command: Extract<DrawCommand, { type: "qr" }>): string {
  const matrix = qrMatrix(command.href);
  const cells = matrix.size + QR_QUIET_ZONE * 2;
  const cell = command.size / cells;
  let path = "";
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (!matrix.dark(row, col)) continue;
      const x = command.x + (col + QR_QUIET_ZONE) * cell;
      const y = command.y + (row + QR_QUIET_ZONE) * cell;
      path += `M${num(x)} ${num(y)}h${num(cell)}v${num(cell)}h-${num(cell)}z`;
    }
  }
  return `<g id="qr"><rect x="${num(command.x)}" y="${num(command.y)}" width="${num(command.size)}" height="${num(command.size)}" fill="${command.background}"/><path fill="${command.foreground}" shape-rendering="crispEdges" d="${path}"/></g>`;
}

function drawPdf(doc: PDFKit.PDFDocument, command: DrawCommand): void {
  doc.fillOpacity(1).strokeOpacity(1);
  if (command.type === "rect") {
    doc.fillOpacity(command.opacity ?? 1);
    if (command.radius) doc.roundedRect(pt(command.x), pt(command.y), pt(command.w), pt(command.h), pt(command.radius)).fill(command.fill);
    else doc.rect(pt(command.x), pt(command.y), pt(command.w), pt(command.h)).fill(command.fill);
    doc.fillOpacity(1);
    return;
  }
  if (command.type === "stroke") {
    doc.strokeOpacity(command.opacity ?? 1).lineWidth(pt(command.width)).strokeColor(command.color);
    if (command.radius) doc.roundedRect(pt(command.x), pt(command.y), pt(command.w), pt(command.h), pt(command.radius)).stroke();
    else doc.rect(pt(command.x), pt(command.y), pt(command.w), pt(command.h)).stroke();
    doc.strokeOpacity(1);
    return;
  }
  if (command.type === "circle") {
    doc.fillOpacity(command.opacity ?? 1).strokeOpacity(command.opacity ?? 1);
    doc.circle(pt(command.cx), pt(command.cy), pt(command.r));
    if (command.fill && command.stroke) {
      doc.lineWidth(pt(command.strokeWidth ?? 0)).fillAndStroke(command.fill, command.stroke);
    } else if (command.fill) doc.fill(command.fill);
    else if (command.stroke) doc.lineWidth(pt(command.strokeWidth ?? 0)).stroke(command.stroke);
    doc.fillOpacity(1).strokeOpacity(1);
    return;
  }
  if (command.type === "image") {
    const bytes = Buffer.from(command.data, "base64");
    doc.save();
    if (command.radius >= Math.min(command.w, command.h) / 2 - 0.05) {
      doc.circle(pt(command.x + command.w / 2), pt(command.y + command.h / 2), pt(Math.min(command.w, command.h) / 2)).clip();
    } else {
      doc.roundedRect(pt(command.x), pt(command.y), pt(command.w), pt(command.h), pt(command.radius)).clip();
    }
    doc.image(bytes, pt(command.x), pt(command.y), { width: pt(command.w), height: pt(command.h) });
    doc.restore();
    return;
  }
  if (command.type === "text") {
    doc.fillOpacity(command.opacity ?? 1).font(fontFile(command.role)).fontSize(pt(command.size)).fillColor(command.color);
    doc.text(command.text, pt(command.x), pt(command.y), {
      width: pt(command.width),
      align: command.align,
      lineBreak: false,
      characterSpacing: pt(command.size * (command.letterSpacing ?? 0)),
    });
    doc.fillOpacity(1);
    return;
  }
  if (command.type === "star") {
    doc.save();
    doc.translate(pt(command.cx), pt(command.cy));
    doc.scale(pt(command.r));
    doc.path(STAR_PATH).fill(command.fill);
    doc.restore();
    return;
  }
  const matrix = qrMatrix(command.href);
  const cells = matrix.size + QR_QUIET_ZONE * 2;
  const cell = command.size / cells;
  doc.rect(pt(command.x), pt(command.y), pt(command.size), pt(command.size)).fill(command.background);
  doc.fillColor(command.foreground);
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (!matrix.dark(row, col)) continue;
      doc.rect(
        pt(command.x + (col + QR_QUIET_ZONE) * cell),
        pt(command.y + (row + QR_QUIET_ZONE) * cell),
        pt(cell),
        pt(cell),
      ).fill();
    }
  }
}

function pt(mm: number): number {
  return mm * MM_TO_PT;
}

function num(value: number): string {
  return (Math.round(value * 1000) / 1000).toString();
}

function usedFontRoles(scene: ArtworkScene): PrintFontRole[] {
  const roles = new Set<PrintFontRole>();
  for (const command of scene.commands) {
    if (command.type === "text") roles.add(command.role);
  }
  if (roles.size === 0) roles.add("body");
  return [...roles];
}

function alpha(opacity: number | undefined): string {
  if (opacity === undefined || opacity >= 1) return "";
  return ` opacity="${num(opacity)}"`;
}

function xml(value: string): string {
  return value
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
