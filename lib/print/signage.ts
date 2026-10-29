import {
  signageFormatSpec,
  type ArtworkFontId,
  type ArtworkLogo,
  type ProductArtworkV5,
} from "@/lib/artwork";
import type { CommercialIssue } from "@/lib/print/commercial-issues";
import { fitText, type FittedText } from "@/lib/print/fit-text";
import type { PrintFontRole } from "@/lib/print/fonts";
import type { ArtworkScene, DrawCommand } from "@/lib/print/scene";
import type { QrSize } from "@/lib/product";

type SignageResult = { ok: true; scene: ArtworkScene } | { ok: false; error: CommercialIssue };

type PlacedText = {
  lines: FittedText;
  role: PrintFontRole;
  x: number;
  y: number;
  width: number;
  color: string;
  align: "left" | "center";
};

export function layoutSignage(artwork: ProductArtworkV5): SignageResult {
  if (!artwork.href) return { ok: false, error: "composition" };
  const format = signageFormatSpec(artwork.format);
  const poster = artwork.format === "poster";
  const nameMin = poster ? 3.6 : 2.8;
  const nameWidth = format.widthMm - (artwork.templateId === "review-brand" ? 22 : 16);
  const smallestName = fitText({
    text: artwork.businessName,
    role: nameRole(artwork.fontId),
    width: nameWidth,
    maxSize: nameMin,
    minSize: nameMin,
    maxLines: poster ? 3 : 2,
    leading: 1.12,
  });
  if (!smallestName) return { ok: false, error: "title-overflow" };

  const floors = qrFloors(artwork.format, artwork.qrSize);
  for (const floor of floors) {
    const scene = place(artwork, format.widthMm, format.heightMm, floor);
    if (scene) return { ok: true, scene };
  }
  return { ok: false, error: "composition" };
}

function place(artwork: ProductArtworkV5, width: number, height: number, floor: number): ArtworkScene | null {
  const poster = artwork.format === "poster";
  const brand = artwork.templateId === "review-brand";
  const rail = brand ? (poster ? 6 : 4) : 0;
  const margin = poster ? 8 : 5;
  const contentX = rail + margin;
  const contentW = width - contentX - margin;
  const mark = poster ? 7 : 5.2;
  const messageRoleName = messageRole(artwork.fontId);
  const nameRoleName = nameRole(artwork.fontId);
  const logoLimits = artwork.logo
    ? poster
      ? brand
        ? [
            [40, 22],
            [28, 14],
          ]
        : [
            [22, 12],
            [16, 8],
          ]
      : brand
        ? [
            [24, 12],
            [16, 8],
          ]
        : [[14, 7]]
    : [[0, 0]];

  for (const [logoW, logoH] of logoLimits) {
    const logo = artwork.logo ? logoBox(artwork.logo, logoW, logoH) : null;
    if (artwork.logo && !logo) continue;
    for (const messageMax of poster ? [9, 7.6, 6.4, 5.4] : [5.2, 4.4, 3.8]) {
      const message = fitText({
        text: artwork.message,
        role: messageRoleName,
        width: contentW,
        maxSize: messageMax,
        minSize: poster ? 5 : 3.4,
        maxLines: poster ? 3 : 2,
        leading: 1.08,
      });
      if (!message) continue;
      for (const nameMax of poster ? [5.4, 4.6, 4, 3.6] : [3.6, 3.2, 2.8]) {
        if (nameMax > message.size - 0.8) continue;
        const name = fitText({
          text: artwork.businessName,
          role: nameRoleName,
          width: contentW,
          maxSize: nameMax,
          minSize: poster ? 3.6 : 2.8,
          maxLines: poster ? 3 : 2,
          leading: 1.1,
        });
        if (!name) continue;
        const instruction = fitText({
          text: artwork.instruction,
          role: "label",
          width: contentW - mark - 2.4,
          maxSize: poster ? 4.2 : 3.2,
          minSize: poster ? 3.2 : 2.6,
          maxLines: 2,
          leading: 1.08,
        });
        if (!instruction) continue;
        const scene = compose({
          artwork,
          width,
          height,
          floor,
          rail,
          contentX,
          contentW,
          mark,
          logo,
          message,
          name,
          instruction,
          messageRoleName,
          nameRoleName,
        });
        if (scene) return scene;
      }
    }
  }
  return null;
}

function compose(input: {
  artwork: ProductArtworkV5;
  width: number;
  height: number;
  floor: number;
  rail: number;
  contentX: number;
  contentW: number;
  mark: number;
  logo: { w: number; h: number } | null;
  message: FittedText;
  name: FittedText;
  instruction: FittedText;
  messageRoleName: PrintFontRole;
  nameRoleName: PrintFontRole;
}): ArtworkScene | null {
  const { artwork, width, height, floor, rail, contentX, contentW, mark, logo, message, name, instruction } = input;
  let y = artwork.format === "poster" ? 9 : 5;
  const commands: DrawCommand[] = [sheet(width, height, artwork.surface)];
  if (rail > 0) commands.push({ type: "rect", x: 0, y: 0, w: rail, h: height, fill: artwork.accent });
  const texts: PlacedText[] = [];
  if (logo && artwork.logo) {
    commands.push({ type: "image", x: contentX, y, w: logo.w, h: logo.h, data: artwork.logo.data, radius: 1.6 });
    y += logo.h + (artwork.format === "poster" ? 3.5 : 2);
  }
  texts.push({
    lines: message,
    role: input.messageRoleName,
    x: contentX,
    y,
    width: contentW,
    color: artwork.ink,
    align: "left",
  });
  y += message.height + 2;
  if (artwork.templateId === "review-clean") {
    commands.push({ type: "rect", x: contentX, y, w: 16, h: 0.8, fill: artwork.accent });
    y += 3;
  }
  texts.push({
    lines: name,
    role: input.nameRoleName,
    x: contentX,
    y,
    width: contentW,
    color: artwork.ink,
    align: "left",
  });
  y += name.height + (artwork.format === "poster" ? 3.2 : 2);
  scanMark(commands, contentX, y, mark, artwork.ink);
  const instructionY = y + Math.max(0, (mark - instruction.height) / 2);
  texts.push({
    lines: instruction,
    role: "label",
    x: contentX + mark + 2.2,
    y: instructionY,
    width: contentW - mark - 2.4,
    color: artwork.ink,
    align: "left",
  });
  y += Math.max(mark, instruction.height) + (artwork.format === "poster" ? 4 : 2.4);
  const qr = roundMm(Math.min(contentW, height - y - (artwork.format === "poster" ? 8 : 5)));
  if (qr < floor) return null;
  const qrX = roundMm((width - qr) / 2);
  if (qrX < rail + 1) return null;
  const href = artwork.href ?? "";
  commands.push({
    type: "qr",
    x: qrX,
    y,
    size: qr,
    foreground: artwork.foreground,
    background: artwork.background,
    href,
  });
  pushText(commands, texts);
  const scene: ArtworkScene = {
    widthMm: width,
    heightMm: height,
    clipRadius: artwork.format === "poster" ? 2 : 2.4,
    commands,
  };
  const markBox = { x: contentX, y: instructionY - Math.max(0, (mark - instruction.height) / 2), w: mark, h: mark };
  if (y + qr > height - 3) return null;
  if (!inside(scene, texts, qrX, y, qr, logo, markBox)) return null;
  return scene;
}

function qrFloors(format: ProductArtworkV5["format"], size: QrSize): number[] {
  const floor = format === "poster" ? 58 : 40;
  const preferred = format === "poster" ? (size === 320 ? 74 : size === 256 ? 68 : 62) : size === 320 ? 52 : size === 256 ? 48 : 42;
  const floors = [];
  for (let value = preferred; value >= floor; value -= 4) floors.push(value);
  if (floors[floors.length - 1] !== floor) floors.push(floor);
  return floors;
}

function sheet(width: number, height: number, fill: string): DrawCommand {
  return { type: "rect", x: 0, y: 0, w: width, h: height, fill };
}

function scanMark(commands: DrawCommand[], x: number, y: number, size: number, color: string) {
  const arm = roundMm(size * 0.32);
  const stroke = 0.45;
  commands.push({ type: "rect", x, y, w: arm, h: stroke, fill: color });
  commands.push({ type: "rect", x, y, w: stroke, h: arm, fill: color });
  commands.push({ type: "rect", x: x + size - arm, y, w: arm, h: stroke, fill: color });
  commands.push({ type: "rect", x: x + size - stroke, y, w: stroke, h: arm, fill: color });
  commands.push({ type: "rect", x, y: y + size - stroke, w: arm, h: stroke, fill: color });
  commands.push({ type: "rect", x, y: y + size - arm, w: stroke, h: arm, fill: color });
  commands.push({ type: "rect", x: x + size - arm, y: y + size - stroke, w: arm, h: stroke, fill: color });
  commands.push({ type: "rect", x: x + size - stroke, y: y + size - arm, w: stroke, h: arm, fill: color });
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
  mark: { x: number; y: number; w: number; h: number },
): boolean {
  const boxes = texts.map((text) => ({ x: text.x, y: text.y, w: text.width, h: text.lines.height }));
  boxes.push({ x: qrX, y: qrY, w: qr, h: qr }, mark);
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
      const overlap = a.x < b.x + b.w - 0.4 && a.x + a.w > b.x + 0.4 && a.y < b.y + b.h - 0.4 && a.y + a.h > b.y + 0.4;
      if (overlap) return false;
    }
  }
  return true;
}

function logoBox(logo: ArtworkLogo, maxW: number, maxH: number): { w: number; h: number } | null {
  if (maxW < 8 || maxH < 6) return null;
  const scale = Math.min(maxW / logo.width, maxH / logo.height);
  const w = roundMm(logo.width * scale);
  const h = roundMm(logo.height * scale);
  if (w < 6 || h < 4) return null;
  return { w, h };
}

function messageRole(fontId: ArtworkFontId): PrintFontRole {
  if (fontId === "fraunces") return "frauncesBold";
  if (fontId === "source") return "label";
  return "display";
}

function nameRole(fontId: ArtworkFontId): PrintFontRole {
  if (fontId === "fraunces") return "fraunces";
  if (fontId === "source") return "sourceMedium";
  return "sora";
}

function roundMm(value: number): number {
  return Math.round(value * 10) / 10;
}
