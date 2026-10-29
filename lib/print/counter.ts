import { contrastRatio } from "@/lib/color";
import {
  counterTemplates,
  type ArtworkFontId,
  type ArtworkLogo,
  type ProductArtworkV4,
} from "@/lib/artwork";
import type { CommercialIssue } from "@/lib/print/commercial-issues";
import { fitText, type FittedText } from "@/lib/print/fit-text";
import type { PrintFontRole } from "@/lib/print/fonts";
import type { ArtworkScene, DrawCommand } from "@/lib/print/scene";
import type { QrSize } from "@/lib/product";

const QR_FLOOR = 48;

type CounterResult = { ok: true; scene: ArtworkScene } | { ok: false; error: CommercialIssue };

type PlacedText = {
  lines: FittedText;
  role: PrintFontRole;
  x: number;
  y: number;
  width: number;
  color: string;
  align: "left" | "center";
};

export function layoutCounter(artwork: ProductArtworkV4): CounterResult {
  if (!artwork.href) return { ok: false, error: "composition" };
  const spec = counterTemplates.find((item) => item.id === artwork.templateId);
  if (!spec) return { ok: false, error: "composition" };

  if (
    artwork.templateId === "brand-pro" &&
    !readableOn(artwork.accent, ["#ffffff", artwork.surface, artwork.ink])
  ) {
    return { ok: false, error: "accent-contrast" };
  }

  const floors = qrFloors(artwork.qrSize);
  for (const floor of floors) {
    const scene = place(artwork, spec.widthMm, spec.heightMm, floor);
    if (scene) return { ok: true, scene };
  }
  return { ok: false, error: "composition" };
}

function place(artwork: ProductArtworkV4, width: number, height: number, floor: number): ArtworkScene | null {
  if (artwork.templateId === "brand-pro") return placeBrand(artwork, width, height, floor);
  if (artwork.templateId === "bold-review") return placeBold(artwork, width, height, floor);
  return placeStack(artwork, width, height, floor);
}

function placeStack(artwork: ProductArtworkV4, width: number, height: number, floor: number): ArtworkScene | null {
  const margin = 8;
  const textWidth = width - margin * 2;
  const nameRole = nameRoleFor(artwork.fontId);
  const actionRole = actionRoleFor(artwork.fontId);
  for (const nameMax of [7.2, 6.2, 5.4, 4.8]) {
    const name = fitText({
      text: artwork.businessName,
      role: nameRole,
      width: textWidth,
      maxSize: nameMax,
      minSize: 4.6,
      maxLines: 3,
      leading: 1.12,
    });
    if (!name) continue;
    for (const actionMax of [5.8, 5, 4.4, 3.8]) {
      const action = fitText({
        text: artwork.subtitle,
        role: actionRole,
        width: textWidth,
        maxSize: actionMax,
        minSize: 3.4,
        maxLines: 2,
        leading: 1.14,
      });
      if (!action) continue;
      const logo = logoBox(artwork.logo, 28, artwork.templateId === "black-modern" ? 10 : 11);
      let y = margin;
      const texts: PlacedText[] = [];
      const commands: DrawCommand[] = [sheet(width, height, artwork.surface)];
      if (logo && artwork.logo) {
        commands.push({ type: "image", x: margin, y, w: logo.w, h: logo.h, data: artwork.logo.data, radius: 2 });
        y += logo.h + 3.5;
      }
      texts.push({ lines: name, role: nameRole, x: margin, y, width: textWidth, color: artwork.ink, align: "left" });
      y += name.height + 3;
      commands.push({ type: "rect", x: margin, y, w: 14, h: 0.7, fill: artwork.accent });
      y += 3.2;
      texts.push({ lines: action, role: actionRole, x: margin, y, width: textWidth, color: artwork.ink, align: "left" });
      y += action.height + 4;
      const qr = roundMm(Math.min(width - margin * 2, height - y - margin));
      if (qr < floor) continue;
      const qrX = roundMm((width - qr) / 2);
      commands.push({
        type: "qr",
        x: qrX,
        y,
        size: qr,
        foreground: artwork.foreground,
        background: artwork.background,
        href: artwork.href ?? "",
      });
      pushText(commands, texts);
      const scene = { widthMm: width, heightMm: height, clipRadius: 2.2, commands };
      if (inside(scene, texts, qrX, y, qr, logo)) return scene;
    }
  }
  return null;
}

function placeBold(artwork: ProductArtworkV4, width: number, height: number, floor: number): ArtworkScene | null {
  const margin = 8;
  const textWidth = width - margin * 2;
  const nameRole = nameRoleFor(artwork.fontId);
  const actionRole = actionRoleFor(artwork.fontId);
  for (const actionMax of [7, 6.2, 5.4, 4.6]) {
    const action = fitText({
      text: artwork.subtitle,
      role: actionRole,
      width: textWidth,
      maxSize: actionMax,
      minSize: 4,
      maxLines: 2,
      leading: 1.08,
    });
    if (!action) continue;
    for (const nameMax of [6, 5.4, 4.8, 4.2]) {
      if (action.size > nameMax + 1.6) continue;
      const name = fitText({
        text: artwork.businessName,
        role: nameRole,
        width: textWidth,
        maxSize: nameMax,
        minSize: 4,
        maxLines: 2,
        leading: 1.1,
      });
      if (!name) continue;
      const headerH = roundMm(6 + action.height + 2.2 + name.height + 4);
      if (headerH > 38) continue;
      const qr = roundMm(Math.min(width - 14, height - headerH - 8));
      if (qr < floor) continue;
      const qrX = roundMm((width - qr) / 2);
      const qrY = roundMm(headerH + 4);
      const commands: DrawCommand[] = [
        sheet(width, height, artwork.surface),
        { type: "rect", x: 0, y: 0, w: width, h: headerH, fill: artwork.ink },
        { type: "rect", x: 0, y: 0, w: width, h: 2.4, fill: artwork.accent },
      ];
      const texts: PlacedText[] = [
        { lines: action, role: actionRole, x: margin, y: 6, width: textWidth, color: artwork.surface, align: "left" },
        {
          lines: name,
          role: nameRole,
          x: margin,
          y: roundMm(6 + action.height + 2.2),
          width: textWidth,
          color: artwork.surface,
          align: "left",
        },
      ];
      commands.push({
        type: "qr",
        x: qrX,
        y: qrY,
        size: qr,
        foreground: artwork.foreground,
        background: artwork.background,
        href: artwork.href ?? "",
      });
      pushText(commands, texts);
      const scene = { widthMm: width, heightMm: height, clipRadius: 2.2, commands };
      if (inside(scene, texts, qrX, qrY, qr, null)) return scene;
    }
  }
  return null;
}

function placeBrand(artwork: ProductArtworkV4, width: number, height: number, floor: number): ArtworkScene | null {
  const actionColor = readableOn(artwork.accent, ["#ffffff", artwork.surface, artwork.ink]);
  if (!actionColor) return null;
  const margin = 14;
  const textWidth = width - margin - 10;
  const nameRole = nameRoleFor(artwork.fontId);
  const actionRole = actionRoleFor(artwork.fontId);
  const logo = logoBox(artwork.logo, 36, 24);
  for (const nameMax of [8, 6.8, 5.8, 4.8]) {
    const name = fitText({
      text: artwork.businessName,
      role: nameRole,
      width: textWidth,
      maxSize: nameMax,
      minSize: 4.6,
      maxLines: 3,
      leading: 1.1,
    });
    if (!name) continue;
    for (const actionMax of [5.4, 4.6, 4]) {
      const action = fitText({
        text: artwork.subtitle,
        role: actionRole,
        width: width - 24,
        maxSize: actionMax,
        minSize: 3.6,
        maxLines: 2,
        leading: 1.1,
      });
      if (!action) continue;
      const footerH = roundMm(Math.max(16, action.height + 8));
      let y = 10;
      const texts: PlacedText[] = [];
      const commands: DrawCommand[] = [
        sheet(width, height, artwork.surface),
        { type: "rect", x: 0, y: 0, w: 7, h: height, fill: artwork.accent },
      ];
      if (logo && artwork.logo) {
        commands.push({ type: "image", x: margin, y, w: logo.w, h: logo.h, data: artwork.logo.data, radius: 2.4 });
        y += logo.h + 3.5;
      }
      texts.push({ lines: name, role: nameRole, x: margin, y, width: textWidth, color: artwork.ink, align: "left" });
      y += name.height + 4;
      const qr = roundMm(Math.min(width - 22, height - footerH - y - action.height - 8));
      if (qr < floor) continue;
      const qrX = roundMm((width - qr) / 2);
      commands.push({
        type: "qr",
        x: qrX,
        y,
        size: qr,
        foreground: artwork.foreground,
        background: artwork.background,
        href: artwork.href ?? "",
      });
      const footerY = height - footerH;
      commands.push({ type: "rect", x: 7, y: footerY, w: width - 7, h: footerH, fill: artwork.accent });
      texts.push({
        lines: action,
        role: actionRole,
        x: 12,
        y: footerY + (footerH - action.height) / 2,
        width: width - 24,
        color: actionColor,
        align: "center",
      });
      pushText(commands, texts);
      const scene = { widthMm: width, heightMm: height, clipRadius: 2.2, commands };
      if (y + qr <= footerY - 3 && inside(scene, texts, qrX, y, qr, logo)) return scene;
    }
  }
  return null;
}

function qrFloors(size: QrSize): number[] {
  const preferred = size === 320 ? 62 : size === 256 ? 56 : QR_FLOOR;
  const floors = [];
  for (let value = preferred; value >= QR_FLOOR; value -= 4) floors.push(value);
  if (floors[floors.length - 1] !== QR_FLOOR) floors.push(QR_FLOOR);
  return floors;
}

function sheet(width: number, height: number, fill: string): DrawCommand {
  return { type: "rect", x: 0, y: 0, w: width, h: height, fill };
}

function pushText(commands: DrawCommand[], texts: PlacedText[]) {
  for (const text of texts) {
    text.lines.lines.forEach((line, index) => {
      commands.push({
        type: "text",
        text: line,
        x: text.x,
        y: text.y + index * text.lines.lineHeight,
        width: text.width,
        size: text.lines.size,
        role: text.role,
        color: text.color,
        align: text.align,
      });
    });
  }
}

function inside(
  scene: ArtworkScene,
  texts: PlacedText[],
  qrX: number,
  qrY: number,
  qr: number,
  logo: { w: number; h: number } | null,
): boolean {
  const boxes = texts.map((text) => ({ x: text.x, y: text.y, w: text.width, h: text.lines.height }));
  boxes.push({ x: qrX, y: qrY, w: qr, h: qr });
  if (logo) {
    const image = scene.commands.find((command) => command.type === "image");
    if (image && image.type === "image") boxes.push({ x: image.x, y: image.y, w: image.w, h: image.h });
  }
  for (const box of boxes) {
    if (box.x < -0.2 || box.y < -0.2 || box.x + box.w > scene.widthMm + 0.2 || box.y + box.h > scene.heightMm + 0.2) {
      return false;
    }
  }
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left];
      const b = boxes[right];
      if (!a || !b) continue;
      const overlap = a.x < b.x + b.w - 0.6 && a.x + a.w > b.x + 0.6 && a.y < b.y + b.h - 0.6 && a.y + a.h > b.y + 0.6;
      if (overlap) return false;
    }
  }
  return true;
}

function logoBox(logo: ArtworkLogo | null, maxW: number, maxH: number): { w: number; h: number } | null {
  if (!logo) return null;
  const scale = Math.min(maxW / logo.width, maxH / logo.height);
  const w = roundMm(logo.width * scale);
  const h = roundMm(logo.height * scale);
  if (w < 8 || h < 8) return null;
  return { w, h };
}

function readableOn(background: string, options: string[]): string | null {
  let fallback: { color: string; ratio: number } | null = null;
  for (const color of options) {
    const ratio = contrastRatio(color, background);
    if (ratio >= 4.5) return color;
    if (ratio >= 3 && (!fallback || ratio > fallback.ratio)) fallback = { color, ratio };
  }
  return fallback?.color ?? null;
}

function nameRoleFor(fontId: ArtworkFontId): PrintFontRole {
  if (fontId === "fraunces") return "fraunces";
  if (fontId === "sora") return "sora";
  return "sourceMedium";
}

function actionRoleFor(fontId: ArtworkFontId): PrintFontRole {
  if (fontId === "fraunces") return "frauncesBold";
  if (fontId === "sora") return "display";
  return "label";
}

function roundMm(value: number): number {
  return Math.round(value * 10) / 10;
}
