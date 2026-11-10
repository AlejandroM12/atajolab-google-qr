import { Resvg } from "@resvg/resvg-js";
import PDFDocument from "pdfkit";
import {
  printFonts,
  svgFontFamily,
  studioFontFaceCss,
  studioFontFamily,
  studioFontFile,
  studioFontFiles,
  studioFontWeight,
} from "@/lib/studio/export/fonts";
import type { StudioDrawCommand, StudioScene } from "@/lib/studio/export/scene";
import { mmToPt, num, studioPrintPixels } from "@/lib/studio/export/units";
import { qrMatrix } from "@/lib/print/qr-matrix";
import { STUDIO_QR_MARGIN_MODULES } from "@/lib/studio/export/qr";
import type { StudioFont } from "@/lib/studio/types";

export type StudioExportFormat = "png" | "svg" | "pdf";

const mimeTypes: Record<StudioExportFormat, string> = {
  png: "image/png",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

export function isStudioExportFormat(value: string): value is StudioExportFormat {
  return value === "png" || value === "svg" || value === "pdf";
}

export async function renderStudioScene(
  scene: StudioScene,
  format: StudioExportFormat,
): Promise<{ body: Buffer; mime: string }> {
  const body =
    format === "svg" ? Buffer.from(renderStudioSvg(scene, "mm"), "utf8")
    : format === "pdf" ? await renderStudioPdf(scene)
    : renderStudioPng(scene);
  return { body, mime: mimeTypes[format] };
}

export function renderStudioSvg(scene: StudioScene, unit: "mm" | "px"): string {
  const width = unit === "mm" ? `${scene.widthMm}mm` : String(studioPrintPixels(scene.widthMm));
  const height = unit === "mm" ? `${scene.heightMm}mm` : String(studioPrintPixels(scene.heightMm));
  const fonts = usedFonts(scene);
  const body = scene.commands.map((command, index) => drawSvg(command, index)).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${num(scene.widthMm)} ${num(scene.heightMm)}"><style>${studioFontFaceCss(fonts)}</style>${body}</svg>`;
}

function renderStudioPng(scene: StudioScene): Buffer {
  const svg = renderStudioSvg(scene, "px");
  const fonts = usedFonts(scene);
  const image = new Resvg(svg, {
    font: {
      fontFiles: studioFontFiles(fonts),
      loadSystemFonts: false,
      defaultFontFamily: printFonts.body.family,
      sansSerifFamily: printFonts.body.family,
    },
    shapeRendering: 1,
    textRendering: 1,
    fitTo: { mode: "width", value: studioPrintPixels(scene.widthMm) },
  }).render();
  const png = image.asPng();
  if (image.width !== studioPrintPixels(scene.widthMm) || image.height !== studioPrintPixels(scene.heightMm)) {
    throw new Error("studio-png-size");
  }
  return png;
}

function renderStudioPdf(scene: StudioScene): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [mmToPt(scene.widthMm), mmToPt(scene.heightMm)],
      margin: 0,
      info: { Creator: "AtajoLab Studio", Title: "Cartel A6" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    for (const command of scene.commands) drawPdf(doc, command);
    doc.end();
  });
}

function drawSvg(command: StudioDrawCommand, index: number): string {
  if (command.type === "rect") {
    const radius = command.radius > 0 ? ` rx="${num(command.radius)}" ry="${num(command.radius)}"` : "";
    const rect = `<rect x="${num(command.x)}" y="${num(command.y)}" width="${num(command.w)}" height="${num(command.h)}" fill="${command.fill}"${radius}/>`;
    return withRotation(rect, command.x, command.y, command.w, command.h, command.rotation);
  }

  if (command.type === "text") {
    const family = studioFontFamily(command.font);
    const weight = studioFontWeight(command.font);
    const lines = command.lines
      .map((line, lineIndex) => {
        const lineTop = command.y + lineIndex * command.lineHeight;
        if (lineTop + command.size * 0.2 > command.y + command.height) return "";
        const anchor = command.align === "center" ? "middle" : command.align === "right" ? "end" : "start";
        const x =
          command.align === "center"
            ? command.x + command.width / 2
            : command.align === "right"
              ? command.x + command.width
              : command.x;
        // resvg ignores dominant-baseline=hanging. Alphabetic baseline ~0.8em from the line
        // top matches Konva top alignment and leaves room for accents + descenders.
        const baseline = lineTop + command.size * 0.8;
        return `<text x="${num(x)}" y="${num(baseline)}" font-family="${svgFontFamily(family)}" font-weight="${weight}" font-size="${num(command.size)}" fill="${command.color}" text-anchor="${anchor}">${xml(line)}</text>`;
      })
      .join("");
    return withRotation(`<g>${lines}</g>`, command.x, command.y, command.width, command.height, command.rotation);
  }

  if (command.type === "image") {
    const parsed = parseDataUrl(command.dataUrl);
    if (!parsed) throw new Error("studio-image");
    const id = `img-clip-${index}`;
    const image = `<clipPath id="${id}"><rect x="${num(command.x)}" y="${num(command.y)}" width="${num(command.w)}" height="${num(command.h)}"/></clipPath><image href="${parsed.href}" xlink:href="${parsed.href}" x="${num(command.x)}" y="${num(command.y)}" width="${num(command.w)}" height="${num(command.h)}" preserveAspectRatio="none" clip-path="url(#${id})"/>`;
    return withRotation(image, command.x, command.y, command.w, command.h, command.rotation);
  }

  return withRotation(qrSvg(command), command.x, command.y, command.size, command.size, command.rotation);
}

function qrSvg(command: Extract<StudioDrawCommand, { type: "qr" }>): string {
  const matrix = qrMatrix(command.href);
  const cells = matrix.size + STUDIO_QR_MARGIN_MODULES * 2;
  const cell = command.size / cells;
  let path = "";
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (!matrix.dark(row, col)) continue;
      const x = command.x + (col + STUDIO_QR_MARGIN_MODULES) * cell;
      const y = command.y + (row + STUDIO_QR_MARGIN_MODULES) * cell;
      path += `M${num(x)} ${num(y)}h${num(cell)}v${num(cell)}h-${num(cell)}z`;
    }
  }
  return `<g><rect x="${num(command.x)}" y="${num(command.y)}" width="${num(command.size)}" height="${num(command.size)}" fill="${command.background}"/><path fill="${command.foreground}" shape-rendering="crispEdges" d="${path}"/></g>`;
}

function drawPdf(doc: PDFKit.PDFDocument, command: StudioDrawCommand): void {
  doc.fillOpacity(1).strokeOpacity(1);
  if (command.type === "rect") {
    withPdfRotation(doc, command.x, command.y, command.w, command.h, command.rotation, () => {
      if (command.radius > 0) {
        doc.roundedRect(mmToPt(command.x), mmToPt(command.y), mmToPt(command.w), mmToPt(command.h), mmToPt(command.radius)).fill(command.fill);
      } else {
        doc.rect(mmToPt(command.x), mmToPt(command.y), mmToPt(command.w), mmToPt(command.h)).fill(command.fill);
      }
    });
    return;
  }

  if (command.type === "text") {
    withPdfRotation(doc, command.x, command.y, command.width, command.height, command.rotation, () => {
      doc.font(studioFontFile(command.font)).fontSize(mmToPt(command.size)).fillColor(command.color);
      for (let index = 0; index < command.lines.length; index += 1) {
        const y = command.y + index * command.lineHeight;
        if (y + command.size * 0.2 > command.y + command.height) break;
        doc.text(command.lines[index]!, mmToPt(command.x), mmToPt(y), {
          width: mmToPt(command.width),
          align: command.align,
          lineBreak: false,
        });
      }
    });
    return;
  }

  if (command.type === "image") {
    const parsed = parseDataUrl(command.dataUrl);
    if (!parsed) throw new Error("studio-image");
    const bytes = Buffer.from(parsed.base64, "base64");
    withPdfRotation(doc, command.x, command.y, command.w, command.h, command.rotation, () => {
      doc.image(bytes, mmToPt(command.x), mmToPt(command.y), {
        width: mmToPt(command.w),
        height: mmToPt(command.h),
      });
    });
    return;
  }

  withPdfRotation(doc, command.x, command.y, command.size, command.size, command.rotation, () => {
    const matrix = qrMatrix(command.href);
    const cells = matrix.size + STUDIO_QR_MARGIN_MODULES * 2;
    const cell = command.size / cells;
    doc.rect(mmToPt(command.x), mmToPt(command.y), mmToPt(command.size), mmToPt(command.size)).fill(command.background);
    doc.fillColor(command.foreground);
    for (let row = 0; row < matrix.size; row += 1) {
      for (let col = 0; col < matrix.size; col += 1) {
        if (!matrix.dark(row, col)) continue;
        doc
          .rect(
            mmToPt(command.x + (col + STUDIO_QR_MARGIN_MODULES) * cell),
            mmToPt(command.y + (row + STUDIO_QR_MARGIN_MODULES) * cell),
            mmToPt(cell),
            mmToPt(cell),
          )
          .fill();
      }
    }
  });
}

function withRotation(markup: string, x: number, y: number, w: number, h: number, rotation: number): string {
  if (!rotation) return markup;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return `<g transform="rotate(${num(rotation)} ${num(cx)} ${num(cy)})">${markup}</g>`;
}

function withPdfRotation(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
  draw: () => void,
): void {
  if (!rotation) {
    draw();
    return;
  }
  const cx = mmToPt(x + w / 2);
  const cy = mmToPt(y + h / 2);
  doc.save();
  doc.translate(cx, cy);
  doc.rotate(rotation);
  doc.translate(-cx, -cy);
  draw();
  doc.restore();
}

function usedFonts(scene: StudioScene): StudioFont[] {
  const fonts = new Set<StudioFont>();
  for (const command of scene.commands) {
    if (command.type === "text") fonts.add(command.font);
  }
  return [...fonts];
}

function parseDataUrl(src: string): { href: string; base64: string; mime: string } | null {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(src);
  if (!match) return null;
  return { href: src, mime: match[1]!.toLowerCase(), base64: match[2]! };
}

function xml(value: string): string {
  return value
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
