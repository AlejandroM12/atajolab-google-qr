import { inflateSync } from "node:zlib";
import {
  signageFormatSpec,
  type ArtworkFontId,
  type ArtworkLogo,
  type ProductArtworkV6,
} from "@/lib/artwork";
import { contrastRatio } from "@/lib/color";
import type { CommercialIssue } from "@/lib/print/commercial-issues";
import { fitText, type FittedText } from "@/lib/print/fit-text";
import { measureText, type PrintFontRole } from "@/lib/print/fonts";
import type { ArtworkScene, DrawCommand } from "@/lib/print/scene";

/**
 * Version 6 compositions.
 * The poster keeps an 8 mm safe margin and the sticker keeps 4 mm.
 * Only the paper color reaches the trim, so these files do not add bleed.
 * These scenes are published. A future redesign must introduce a new artwork version.
 */

type PressResult = { ok: true; scene: ArtworkScene } | { ok: false; error: CommercialIssue };

type Box = { x: number; y: number; w: number; h: number };

type PlacedText = {
  lines: FittedText;
  role: PrintFontRole;
  x: number;
  y: number;
  width: number;
  color: string;
  align: "left" | "center";
};

const POSTER_MARGIN = 8;
const STICKER_MARGIN = 4;

export function layoutPress(artwork: ProductArtworkV6): PressResult {
  if (!artwork.href) return { ok: false, error: "composition" };
  const format = signageFormatSpec(artwork.format);
  const margin = artwork.format === "poster" ? POSTER_MARGIN : STICKER_MARGIN;
  const nameWidth = format.widthMm - margin * 2;
  const smallestName = fitText({
    text: artwork.businessName,
    role: nameRole(artwork.fontId),
    width: nameWidth,
    maxSize: artwork.format === "poster" ? 3.4 : 2.6,
    minSize: artwork.format === "poster" ? 3.4 : 2.6,
    maxLines: artwork.format === "poster" ? 3 : 2,
    leading: 1.08,
  });
  if (!smallestName) return { ok: false, error: "title-overflow" };

  for (const qr of qrTargets(artwork)) {
    const scene = artwork.format === "poster" ? poster(artwork, qr) : sticker(artwork, qr);
    if (scene) return { ok: true, scene };
  }
  return { ok: false, error: "composition" };
}

function poster(artwork: ProductArtworkV6, qr: number): ArtworkScene | null {
  if (artwork.templateId === "review-dark") return darkPoster(artwork, qr);
  if (artwork.templateId === "review-brand") return brandPoster(artwork, qr);
  return cleanPoster(artwork, qr);
}

function cleanPoster(artwork: ProductArtworkV6, qr: number): ArtworkScene | null {
  const width = 105;
  const height = 148;
  const contentW = width - POSTER_MARGIN * 2;
  const logos = artwork.logo ? logoChoices(artwork.logo, [[32, 14], [22, 10]]) : [null];
  for (const logo of logos) {
    if (artwork.logo && !logo) continue;
    for (const messageMax of [10, 8.8, 7.6, 6.4]) {
      const message = fitExact(artwork.message, messageRole(artwork.fontId), contentW, messageMax, 3, 1.08);
      if (!message) continue;
      const nameMax = Math.min(5.8, roundMm(message.size - 1.6));
      const name = fitText({
        text: artwork.businessName,
        role: nameRole(artwork.fontId),
        width: contentW,
        maxSize: nameMax,
        minSize: 3.4,
        maxLines: 3,
        leading: 1.08,
      });
      if (!name || name.size > message.size - 1.4) continue;
      const instruction = fitText({
        text: artwork.instruction,
        role: "label",
        width: contentW,
        maxSize: 4,
        minSize: 3.2,
        maxLines: 2,
        leading: 1.08,
      });
      if (!instruction) continue;
      const scene = packCleanPoster({ artwork, qr, logo, message, name, instruction, width, height, contentW });
      if (scene) return scene;
    }
  }
  return null;
}

function packCleanPoster(input: {
  artwork: ProductArtworkV6;
  qr: number;
  logo: { w: number; h: number } | null;
  message: FittedText;
  name: FittedText;
  instruction: FittedText;
  width: number;
  height: number;
  contentW: number;
}): ArtworkScene | null {
  const { artwork, qr, logo, message, name, instruction, width, height, contentW } = input;
  const afterMessage = 2.4;
  const ruleH = 0.55;
  const afterRule = 3.2;
  const afterQr = 3.2;
  const group = (logo ? logo.h + 3.2 : 0) + message.height + afterMessage + ruleH + afterRule + name.height;
  const placed = balancePoster({ height, group, qr, footer: instruction.height, afterQr, minMid: 6.5, maxMid: 12 });
  if (!placed) return null;

  const commands: DrawCommand[] = [sheet(width, height, artwork.surface)];
  const texts: PlacedText[] = [];
  const boxes: Box[] = [];
  let y = placed.top;
  if (logo && artwork.logo) {
    const logoX = roundMm((width - logo.w) / 2);
    const drawn = paintLogo(commands, artwork, artwork.logo, logoX, y, logo.w, logo.h);
    boxes.push({ x: drawn.x, y: drawn.y, w: drawn.w, h: drawn.h });
    y += logo.h + 3.2;
  }
  texts.push(block(message, messageRole(artwork.fontId), POSTER_MARGIN, y, contentW, artwork.ink, "center"));
  boxes.push({ x: POSTER_MARGIN, y, w: contentW, h: message.height });
  y += message.height + afterMessage;
  const ruleW = titleRuleWidth(message, messageRole(artwork.fontId), 36);
  const ruleX = roundMm((width - ruleW) / 2);
  commands.push({ type: "rect", x: ruleX, y, w: ruleW, h: ruleH, fill: artwork.accent });
  boxes.push({ x: ruleX, y, w: ruleW, h: ruleH });
  y += ruleH + afterRule;
  texts.push(block(name, nameRole(artwork.fontId), POSTER_MARGIN, y, contentW, artwork.ink, "center"));
  boxes.push({ x: POSTER_MARGIN, y, w: contentW, h: name.height });

  const qrY = roundMm(y + name.height + placed.mid);
  const qrX = roundMm((width - qr) / 2);
  const caption = placeCaption(commands, boxes, instruction, qrY + qr + afterQr, width, 0, false, "center", artwork.ink);
  if (!caption) return null;
  commands.push(qrCommand(artwork, qrX, qrY, qr));
  boxes.push({ x: qrX, y: qrY, w: qr, h: qr });
  pushText(commands, texts);
  return finish(width, height, 2, commands, boxes, POSTER_MARGIN);
}

function darkPoster(artwork: ProductArtworkV6, qr: number): ArtworkScene | null {
  const width = 105;
  const height = 148;
  const contentW = width - POSTER_MARGIN * 2;
  const logos = artwork.logo ? logoChoices(artwork.logo, [[28, 12], [18, 8]]) : [null];
  for (const logo of logos) {
    if (artwork.logo && !logo) continue;
    for (const messageMax of [11.2, 9.6, 8.4, 7.2]) {
      const message = fitExact(artwork.message, messageRole(artwork.fontId), contentW, messageMax, 2, 1.02);
      if (!message) continue;
      const name = fitText({
        text: artwork.businessName,
        role: nameRole(artwork.fontId),
        width: contentW,
        maxSize: Math.min(4.4, roundMm(message.size - 3)),
        minSize: 3.2,
        maxLines: 2,
        leading: 1.05,
      });
      if (!name || name.size > message.size - 2.8) continue;
      const instruction = fitText({
        text: artwork.instruction,
        role: "label",
        width: contentW,
        maxSize: 3.6,
        minSize: 3,
        maxLines: 2,
        leading: 1.05,
      });
      if (!instruction) continue;
      const scene = packDarkPoster({ artwork, qr, logo, message, name, instruction, width, height, contentW });
      if (scene) return scene;
    }
  }
  return null;
}

function packDarkPoster(input: {
  artwork: ProductArtworkV6;
  qr: number;
  logo: { w: number; h: number } | null;
  message: FittedText;
  name: FittedText;
  instruction: FittedText;
  width: number;
  height: number;
  contentW: number;
}): ArtworkScene | null {
  const { artwork, qr, logo, message, name, instruction, width, height, contentW } = input;
  const qrY = roundMm(height - POSTER_MARGIN - qr);
  const top = POSTER_MARGIN + 2;
  let y = top;
  const commands: DrawCommand[] = [sheet(width, height, artwork.surface)];
  const texts: PlacedText[] = [];
  const boxes: Box[] = [];
  if (logo && artwork.logo) {
    const drawn = paintLogo(commands, artwork, artwork.logo, POSTER_MARGIN, y, logo.w, logo.h);
    boxes.push({ x: drawn.x, y: drawn.y, w: drawn.w, h: drawn.h });
    y += logo.h + 3.5;
  }
  texts.push(block(message, messageRole(artwork.fontId), POSTER_MARGIN, y, contentW, artwork.ink, "left"));
  boxes.push({ x: POSTER_MARGIN, y, w: contentW, h: message.height });
  y += message.height + 3.2;
  texts.push(block(name, nameRole(artwork.fontId), POSTER_MARGIN, y, contentW, artwork.ink, "left"));
  boxes.push({ x: POSTER_MARGIN, y, w: contentW, h: name.height });
  y += name.height + 1;
  if (contrastRatio(artwork.accent, artwork.surface) >= 3) {
    const ruleW = 14;
    commands.push({ type: "rect", x: POSTER_MARGIN, y, w: ruleW, h: 0.4, fill: artwork.accent });
    boxes.push({ x: POSTER_MARGIN, y, w: ruleW, h: 0.4 });
    y += 1.4;
  } else {
    y += 1.4;
  }
  texts.push(block(instruction, "label", POSTER_MARGIN, y, contentW, artwork.ink, "left"));
  boxes.push({ x: POSTER_MARGIN, y, w: contentW, h: instruction.height });
  y += instruction.height;
  if (qrY < y + 6) return null;
  const qrX = roundMm((width - qr) / 2);
  commands.push(qrCommand(artwork, qrX, qrY, qr));
  boxes.push({ x: qrX, y: qrY, w: qr, h: qr });
  pushText(commands, texts);
  const scene = finish(width, height, 2, commands, boxes, POSTER_MARGIN);
  if (!scene) return null;
  if (scene.commands.some((command) => command.type === "stroke")) return null;
  return scene;
}

function brandPoster(artwork: ProductArtworkV6, qr: number): ArtworkScene | null {
  const width = 105;
  const height = 148;
  const contentW = width - POSTER_MARGIN * 2;
  const variants = brandMastheads(artwork, contentW);
  for (const mast of variants) {
    for (const messageMax of [6.8, 6, 5.2, 4.4]) {
      const message = fitExact(artwork.message, messageRole(artwork.fontId), contentW, messageMax, 3, 1.08);
      if (!message) continue;
      const instruction = fitText({
        text: artwork.instruction,
        role: "label",
        width: contentW,
        maxSize: 3.8,
        minSize: 3.2,
        maxLines: 2,
        leading: 1.08,
      });
      if (!instruction) continue;
      const scene = packBrandPoster({ artwork, qr, mast, message, instruction, width, height, contentW });
      if (scene) return scene;
    }
  }
  return null;
}

function packBrandPoster(input: {
  artwork: ProductArtworkV6;
  qr: number;
  mast: Masthead;
  message: FittedText;
  instruction: FittedText;
  width: number;
  height: number;
  contentW: number;
}): ArtworkScene | null {
  const { artwork, qr, mast, message, instruction, width, height, contentW } = input;
  const afterQr = 3.2;
  const ruleH = 0.7;
  const underRule = 2.6;
  const group = mast.height + 2.6 + ruleH + underRule + message.height;
  const placed = balancePoster({ height, group, qr, footer: instruction.height, afterQr, minMid: 6, maxMid: 14 });
  if (!placed) return null;

  const commands: DrawCommand[] = [sheet(width, height, artwork.surface)];
  const texts: PlacedText[] = [];
  const boxes: Box[] = [];
  let y = placed.top;
  y = paintMasthead(commands, texts, boxes, artwork, mast, y);
  y += 2.6;
  const ruleW = roundMm(Math.min(contentW, Math.max(24, mastheadSpan(mast, nameRole(artwork.fontId)))));
  commands.push({ type: "rect", x: POSTER_MARGIN, y, w: ruleW, h: ruleH, fill: artwork.accent });
  boxes.push({ x: POSTER_MARGIN, y, w: ruleW, h: ruleH });
  y += ruleH + underRule;
  texts.push(block(message, messageRole(artwork.fontId), POSTER_MARGIN, y, contentW, artwork.ink, "left"));
  boxes.push({ x: POSTER_MARGIN, y, w: contentW, h: message.height });

  const qrY = roundMm(y + message.height + placed.mid);
  const qrX = roundMm((width - qr) / 2);
  const caption = placeCaption(commands, boxes, instruction, qrY + qr + afterQr, width, 0, false, "left", artwork.ink);
  if (!caption) return null;
  commands.push(qrCommand(artwork, qrX, qrY, qr));
  boxes.push({ x: qrX, y: qrY, w: qr, h: qr });
  pushText(commands, texts);
  return finish(width, height, 2, commands, boxes, POSTER_MARGIN);
}

function sticker(artwork: ProductArtworkV6, qr: number): ArtworkScene | null {
  const accent = artwork.templateId !== "review-dark";
  const scene = packSticker(artwork, qr, false, accent);
  if (scene) return scene;
  if (accent && qr === 48) return packSticker(artwork, qr, false, false);
  return null;
}

function packSticker(artwork: ProductArtworkV6, qr: number, useMark: boolean, useAccent: boolean): ArtworkScene | null {
  const width = 80;
  const height = 80;
  const contentW = width - STICKER_MARGIN * 2;
  const contentX = STICKER_MARGIN;
  const mast = stickerMasthead(artwork, contentW);
  if (artwork.logo && !mast) return null;
  const message = fitText({
    text: artwork.message,
    role: messageRole(artwork.fontId),
    width: contentW,
    maxSize: 4.2,
    minSize: 3.2,
    maxLines: 2,
    leading: 1.05,
  });
  if (!message) return null;
  const nameWidth = mast?.nameWidth ?? contentW;
  const name = fitText({
    text: artwork.businessName,
    role: nameRole(artwork.fontId),
    width: nameWidth,
    maxSize: Math.min(3.4, roundMm(message.size - 0.6)),
    minSize: 2.6,
    maxLines: 2,
    leading: 1.05,
  });
  if (!name) return null;
  const mark = useMark ? 4.5 : 0;
  const instruction = fitText({
    text: artwork.instruction,
    role: "label",
    width: mark > 0 ? contentW - mark - 1.8 : contentW,
    maxSize: 2.8,
    minSize: 2.5,
    maxLines: 1,
    leading: 1.05,
  });
  if (!instruction) return null;

  const accentH = useAccent ? 1.6 : 0;
  const logoAbove = mast && !mast.beside ? mast.logoH + 1 : 0;
  const nameRow = mast?.beside ? Math.max(mast.logoH, name.height) : name.height;
  const header = logoAbove + message.height + 1.1 + accentH + nameRow;
  const footer = Math.max(instruction.height, mark);
  const qrY = roundMm(height - STICKER_MARGIN - 1.2 - footer - qr);
  const top = STICKER_MARGIN;
  if (qrY < top + header + 1.2) return null;

  const commands: DrawCommand[] = [sheet(width, height, artwork.surface)];
  const texts: PlacedText[] = [];
  const boxes: Box[] = [];
  const align = artwork.templateId === "review-clean" ? "center" : "left";
  let y = top;
  if (mast && !mast.beside && artwork.logo) {
    const logoX = align === "center" ? roundMm((width - mast.logoW) / 2) : contentX;
    const drawn = paintLogo(commands, artwork, artwork.logo, logoX, y, mast.logoW, mast.logoH);
    boxes.push({ x: drawn.x, y: drawn.y, w: drawn.w, h: drawn.h });
    y += mast.logoH + 1;
  }
  texts.push(block(message, messageRole(artwork.fontId), contentX, y, contentW, artwork.ink, align));
  boxes.push({ x: contentX, y, w: contentW, h: message.height });
  y += message.height + 1.1;
  if (useAccent) {
    const ruleW = artwork.templateId === "review-brand" ? 16 : 14;
    const ruleX = align === "center" ? roundMm((width - ruleW) / 2) : contentX;
    commands.push({ type: "rect", x: ruleX, y, w: ruleW, h: 0.55, fill: artwork.accent });
    boxes.push({ x: ruleX, y, w: ruleW, h: 0.55 });
    y += 1.6;
  }
  if (mast?.beside && artwork.logo) {
    const rowH = Math.max(mast.logoH, name.height);
    const logoY = y + (rowH - mast.logoH) / 2;
    const nameY = y + (rowH - name.height) / 2;
    const drawn = paintLogo(commands, artwork, artwork.logo, contentX, logoY, mast.logoW, mast.logoH);
    boxes.push({ x: drawn.x, y: drawn.y, w: drawn.w, h: drawn.h });
    const nameX = contentX + mast.logoW + 2.4;
    texts.push(block(name, nameRole(artwork.fontId), nameX, nameY, mast.nameWidth, artwork.ink, "left"));
    boxes.push({ x: nameX, y: nameY, w: mast.nameWidth, h: name.height });
    y += rowH;
  } else {
    texts.push(block(name, nameRole(artwork.fontId), contentX, y, contentW, artwork.ink, align));
    boxes.push({ x: contentX, y, w: contentW, h: name.height });
    y += name.height;
  }
  if (y + 1.2 > qrY) return null;

  const qrX = roundMm((width - qr) / 2);
  commands.push(qrCommand(artwork, qrX, qrY, qr));
  boxes.push({ x: qrX, y: qrY, w: qr, h: qr });
  const caption = placeCaption(commands, boxes, instruction, qrY + qr + 1.2, width, mark, useMark, align, artwork.ink);
  if (!caption) return null;
  pushText(commands, texts);
  return finish(width, height, 1.6, commands, boxes, STICKER_MARGIN);
}

type Masthead = {
  logoW: number;
  logoH: number;
  beside: boolean;
  name: FittedText | null;
  nameWidth: number;
  height: number;
};

function brandMastheads(artwork: ProductArtworkV6, contentW: number): Masthead[] {
  const role = nameRole(artwork.fontId);
  if (!artwork.logo) {
    const name = fitText({
      text: artwork.businessName,
      role,
      width: contentW,
      maxSize: 7.2,
      minSize: 4,
      maxLines: 3,
      leading: 1.05,
    });
    return name ? [{ logoW: 0, logoH: 0, beside: false, name, nameWidth: contentW, height: name.height }] : [];
  }

  const variants: Masthead[] = [];
  const beside = besideLockup(artwork.logo, artwork.businessName, role, contentW);
  if (beside) {
    variants.push({
      logoW: beside.logoW,
      logoH: beside.logoH,
      beside: true,
      name: beside.name,
      nameWidth: beside.nameWidth,
      height: Math.max(beside.logoH, beside.name.height),
    });
  }
  const stacked = stackedLogo(artwork.logo);
  const stackedName = fitText({
    text: artwork.businessName,
    role,
    width: contentW,
    maxSize: 6.4,
    minSize: 3.6,
    maxLines: 3,
    leading: 1.05,
  });
  if (stacked && stackedName) {
    variants.push({
      logoW: stacked.w,
      logoH: stacked.h,
      beside: false,
      name: stackedName,
      nameWidth: contentW,
      height: stacked.h + 2.2 + stackedName.height,
    });
  }
  return variants;
}

function stickerMasthead(artwork: ProductArtworkV6, contentW: number): Masthead | null {
  if (!artwork.logo) return { logoW: 0, logoH: 0, beside: false, name: null, nameWidth: contentW, height: 0 };
  if (artwork.templateId === "review-brand") {
    const beside = besideLockup(artwork.logo, artwork.businessName, nameRole(artwork.fontId), contentW, 22, 7, 2.6);
    if (beside) {
      return {
        logoW: beside.logoW,
        logoH: beside.logoH,
        beside: true,
        name: beside.name,
        nameWidth: beside.nameWidth,
        height: Math.max(beside.logoH, beside.name.height),
      };
    }
    const stacked = logoBox(artwork.logo, 16, 8, 4, 4);
    if (!stacked) return null;
    return { logoW: stacked.w, logoH: stacked.h, beside: false, name: null, nameWidth: contentW, height: stacked.h };
  }
  const limits = artwork.templateId === "review-dark" ? [18, 7] : [20, 8];
  const stacked = logoBox(artwork.logo, limits[0] ?? 18, limits[1] ?? 7);
  if (!stacked) return null;
  return { logoW: stacked.w, logoH: stacked.h, beside: false, name: null, nameWidth: contentW, height: stacked.h };
}

function besideLockup(
  logo: ArtworkLogo,
  businessName: string,
  role: PrintFontRole,
  contentW: number,
  maxW = 40,
  maxH = 16,
  minName = 3.4,
): { logoW: number; logoH: number; name: FittedText; nameWidth: number } | null {
  if (logo.width / logo.height < 1.35 || logo.width / logo.height > 2.4) return null;
  const box = logoBox(logo, maxW, maxH);
  if (!box || box.w < box.h * 1.2) return null;
  const nameWidth = roundMm(contentW - box.w - (maxW > 30 ? 3.2 : 2.4));
  if (nameWidth < 22) return null;
  const name = fitText({
    text: businessName,
    role,
    width: nameWidth,
    maxSize: maxW > 30 ? 5.6 : 3.2,
    minSize: minName,
    maxLines: 2,
    leading: 1.05,
  });
  if (!name) return null;
  return { logoW: box.w, logoH: box.h, name, nameWidth };
}

function paintMasthead(
  commands: DrawCommand[],
  texts: PlacedText[],
  boxes: Box[],
  artwork: ProductArtworkV6,
  mast: Masthead,
  y: number,
): number {
  if (mast.beside && artwork.logo && mast.name) {
    const rowH = Math.max(mast.logoH, mast.name.height);
    const logoY = y + (rowH - mast.logoH) / 2;
    const nameY = y + (rowH - mast.name.height) / 2;
    const drawn = paintLogo(commands, artwork, artwork.logo, POSTER_MARGIN, logoY, mast.logoW, mast.logoH);
    boxes.push({ x: drawn.x, y: drawn.y, w: drawn.w, h: drawn.h });
    const nameX = POSTER_MARGIN + mast.logoW + 3.2;
    texts.push(block(mast.name, nameRole(artwork.fontId), nameX, nameY, mast.nameWidth, artwork.ink, "left"));
    boxes.push({ x: nameX, y: nameY, w: mast.nameWidth, h: mast.name.height });
    return y + rowH;
  }
  if (artwork.logo && mast.logoH > 0) {
    const drawn = paintLogo(commands, artwork, artwork.logo, POSTER_MARGIN, y, mast.logoW, mast.logoH);
    boxes.push({ x: drawn.x, y: drawn.y, w: drawn.w, h: drawn.h });
    y += mast.logoH + 2.2;
  }
  if (mast.name) {
    texts.push(block(mast.name, nameRole(artwork.fontId), POSTER_MARGIN, y, mast.nameWidth, artwork.ink, "left"));
    boxes.push({ x: POSTER_MARGIN, y, w: mast.nameWidth, h: mast.name.height });
    y += mast.name.height;
  }
  return y;
}

function placeCaption(
  commands: DrawCommand[],
  boxes: Box[],
  instruction: FittedText,
  y: number,
  width: number,
  mark: number,
  useMark: boolean,
  align: "left" | "center",
  color: string,
): boolean {
  const margin = width > 90 ? POSTER_MARGIN : STICKER_MARGIN;
  const contentX = margin;
  const contentW = width - margin * 2;
  if (!useMark || mark <= 0) {
    boxes.push({ x: contentX, y, w: contentW, h: instruction.height });
    commands.push(...textCommands(block(instruction, "label", contentX, y, contentW, color, align)));
    return true;
  }
  return false;
}

function balancePoster(input: {
  height: number;
  group: number;
  qr: number;
  footer: number;
  afterQr: number;
  minMid: number;
  maxMid: number;
}): { top: number; mid: number } | null {
  const inner = input.height - POSTER_MARGIN * 2;
  const fixed = input.group + input.minMid + input.qr + input.afterQr + input.footer;
  if (fixed > inner + 0.05) return null;
  const extra = inner - fixed;
  const midGrow = Math.min(input.maxMid - input.minMid, extra * 0.28);
  const mid = input.minMid + midGrow;
  const rest = extra - midGrow;
  let top = POSTER_MARGIN + rest * 0.42;
  const qrY = top + input.group + mid;
  if (qrY + input.qr / 2 < input.height / 2) {
    const shift = input.height / 2 - input.qr / 2 - qrY;
    const bottom = input.height - POSTER_MARGIN - (qrY + input.qr + input.afterQr + input.footer);
    top += Math.min(shift, Math.max(0, bottom));
  }
  const end = top + input.group + mid + input.qr + input.afterQr + input.footer;
  if (top < POSTER_MARGIN - 0.05 || end > input.height - POSTER_MARGIN + 0.05) return null;
  return { top: roundMm(top), mid: roundMm(mid) };
}

function titleRuleWidth(lines: FittedText, role: PrintFontRole, max: number): number {
  const widest = Math.max(...lines.lines.map((line) => measureText(role, lines.size, line)));
  return roundMm(Math.min(max, Math.max(16, widest * 0.55)));
}

function mastheadSpan(mast: Masthead, role: PrintFontRole): number {
  const nameW = mast.name ? Math.max(...mast.name.lines.map((line) => measureText(role, mast.name?.size ?? 0, line))) : 0;
  if (mast.beside) return mast.logoW + 3.2 + nameW;
  return Math.max(mast.logoW, nameW);
}

function qrTargets(artwork: ProductArtworkV6): number[] {
  const size = artwork.qrSize;
  if (artwork.format === "sticker") {
    const preferred = size === 320 ? 58 : size === 256 ? 56 : 52;
    return steps(preferred, 48);
  }
  if (artwork.templateId === "review-dark") {
    const preferred = size === 320 ? 80 : size === 256 ? 78 : 70;
    return steps(preferred, 62);
  }
  if (artwork.templateId === "review-brand") {
    const preferred = size === 320 ? 72 : size === 256 ? 68 : 62;
    return steps(preferred, 58);
  }
  const preferred = size === 320 ? 76 : size === 256 ? 72 : 64;
  return steps(preferred, 58);
}

function steps(preferred: number, floor: number): number[] {
  const values: number[] = [];
  for (let value = preferred; value >= floor; value -= 4) values.push(value);
  if (values[values.length - 1] !== floor) values.push(floor);
  return values;
}

function finish(
  width: number,
  height: number,
  clipRadius: number,
  commands: DrawCommand[],
  boxes: Box[],
  margin: number,
): ArtworkScene | null {
  if (!inside(width, height, boxes, margin)) return null;
  return { widthMm: width, heightMm: height, clipRadius, commands };
}

function inside(width: number, height: number, boxes: Box[], margin: number): boolean {
  for (const box of boxes) {
    if (box.w <= 0 || box.h <= 0) return false;
    if (box.x < margin - 0.05 || box.y < margin - 0.05) return false;
    if (box.x + box.w > width - margin + 0.05) return false;
    if (box.y + box.h > height - margin + 0.05) return false;
  }
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left];
      const b = boxes[right];
      if (!a || !b) continue;
      const overlap = a.x < b.x + b.w - 0.35 && a.x + a.w > b.x + 0.35 && a.y < b.y + b.h - 0.35 && a.y + a.h > b.y + 0.35;
      if (overlap) return false;
    }
  }
  return true;
}

function sheet(width: number, height: number, fill: string): DrawCommand {
  return { type: "rect", x: 0, y: 0, w: width, h: height, fill };
}

function paintLogo(
  commands: DrawCommand[],
  artwork: ProductArtworkV6,
  logo: ArtworkLogo,
  x: number,
  y: number,
  w: number,
  h: number,
): Extract<DrawCommand, { type: "image" }> {
  const drawn = image(logo, x, y, w, h);
  if (artwork.templateId === "review-dark" && logoNeedsPlate(logo.data, artwork.surface)) {
    const radius = Math.min(1.2, roundMm(Math.min(drawn.w, drawn.h) / 2 - 0.05));
    commands.push({
      type: "rect",
      x: drawn.x,
      y: drawn.y,
      w: drawn.w,
      h: drawn.h,
      fill: "#f6f4ef",
      radius: radius > 0.4 ? radius : 0,
    });
  }
  commands.push(drawn);
  return drawn;
}

function logoNeedsPlate(data: string, surface: string): boolean {
  const png = readLogoPixels(data);
  if (!png) return false;
  const total = png.width * png.height;
  if (total < 16) return false;
  const step = Math.max(1, Math.floor(total / 4000));
  let transparent = 0;
  let ink = 0;
  let weak = 0;
  for (let pixel = 0; pixel < total; pixel += step) {
    const index = pixel * 4;
    const alpha = png.data[index + 3] ?? 255;
    if (alpha < 32) {
      transparent += 1;
      continue;
    }
    ink += 1;
    const hex = `#${toHex(png.data[index] ?? 0)}${toHex(png.data[index + 1] ?? 0)}${toHex(png.data[index + 2] ?? 0)}`;
    if (contrastRatio(hex, surface) < 3) weak += 1;
  }
  const seen = transparent + ink;
  return ink >= 8 && seen > 0 && weak / ink >= 0.6 && transparent / seen >= 0.08;
}

function readLogoPixels(data: string): { width: number; height: number; data: Uint8Array } | null {
  try {
    const bytes = Buffer.from(data, "base64");
    if (bytes.length < 33) return null;
    let offset = 8;
    let width = 0;
    let height = 0;
    let colorType = 0;
    const rows: Buffer[] = [];
    while (offset + 8 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      const end = offset + 8 + length;
      if (end + 4 > bytes.length) return null;
      const chunk = bytes.subarray(offset + 8, end);
      if (type === "IHDR") {
        width = chunk.readUInt32BE(0);
        height = chunk.readUInt32BE(4);
        if (chunk[8] !== 8 || (chunk[9] !== 2 && chunk[9] !== 6) || chunk[12] !== 0) return null;
        colorType = chunk[9] ?? 0;
      } else if (type === "IDAT") {
        rows.push(chunk);
      } else if (type === "IEND") {
        break;
      }
      offset = end + 4;
    }
    if (width < 16 || height < 16 || rows.length === 0) return null;
    const channels = colorType === 6 ? 4 : 3;
    const raw = inflateSync(Buffer.concat(rows));
    const stride = width * channels;
    if (raw.length < height * (stride + 1)) return null;
    const out = new Uint8Array(width * height * 4);
    let src = 0;
    let previous = new Uint8Array(stride);
    for (let y = 0; y < height; y += 1) {
      const filter = raw[src] ?? 0;
      src += 1;
      const current = new Uint8Array(stride);
      for (let index = 0; index < stride; index += 1) {
        const value = raw[src + index] ?? 0;
        const left = index >= channels ? current[index - channels] ?? 0 : 0;
        const up = previous[index] ?? 0;
        const upLeft = index >= channels ? previous[index - channels] ?? 0 : 0;
        if (filter === 0) current[index] = value;
        else if (filter === 1) current[index] = (value + left) & 255;
        else if (filter === 2) current[index] = (value + up) & 255;
        else if (filter === 3) current[index] = (value + Math.floor((left + up) / 2)) & 255;
        else if (filter === 4) current[index] = (value + paeth(left, up, upLeft)) & 255;
        else return null;
      }
      src += stride;
      for (let x = 0; x < width; x += 1) {
        const from = x * channels;
        const to = (y * width + x) * 4;
        out[to] = current[from] ?? 0;
        out[to + 1] = current[from + 1] ?? 0;
        out[to + 2] = current[from + 2] ?? 0;
        out[to + 3] = channels === 4 ? current[from + 3] ?? 255 : 255;
      }
      previous = current;
    }
    return { width, height, data: out };
  } catch {
    return null;
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const diagonal = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= diagonal) return left;
  if (upDistance <= diagonal) return up;
  return upLeft;
}

function toHex(channel: number): string {
  return channel.toString(16).padStart(2, "0");
}

function image(logo: ArtworkLogo, x: number, y: number, w: number, h: number): Extract<DrawCommand, { type: "image" }> {
  return { type: "image", x: roundMm(x), y: roundMm(y), w: roundMm(w), h: roundMm(h), data: logo.data, radius: 0 };
}

function qrCommand(artwork: ProductArtworkV6, x: number, y: number, size: number): DrawCommand {
  return {
    type: "qr",
    x,
    y,
    size,
    foreground: artwork.foreground,
    background: artwork.background,
    href: artwork.href ?? "",
  };
}

function block(
  lines: FittedText,
  role: PrintFontRole,
  x: number,
  y: number,
  width: number,
  color: string,
  align: "left" | "center",
): PlacedText {
  return { lines, role, x, y, width, color, align };
}

function pushText(commands: DrawCommand[], texts: PlacedText[]) {
  for (const text of texts) commands.push(...textCommands(text));
}

function textCommands(text: PlacedText): DrawCommand[] {
  return text.lines.lines.map((line, index) => ({
    type: "text" as const,
    text: line,
    x: text.x,
    y: text.y + index * text.lines.lineHeight,
    width: text.width,
    size: text.lines.size,
    role: text.role,
    color: text.color,
    align: text.align,
  }));
}

function fitExact(
  text: string,
  role: PrintFontRole,
  width: number,
  size: number,
  maxLines: number,
  leading: number,
): FittedText | null {
  return fitText({ text, role, width, maxSize: size, minSize: size, maxLines, leading });
}

function logoChoices(logo: ArtworkLogo, limits: Array<[number, number]>): Array<{ w: number; h: number } | null> {
  return limits.map(([maxW, maxH]) => logoBox(logo, maxW, maxH));
}

function stackedLogo(logo: ArtworkLogo): { w: number; h: number } | null {
  const ratio = logo.width / logo.height;
  if (ratio < 0.8) return logoBox(logo, 20, 26);
  if (ratio > 2.2) return logoBox(logo, 48, 14);
  if (ratio > 1.35) return logoBox(logo, 42, 15);
  return logoBox(logo, 22, 22);
}

function logoBox(
  logo: ArtworkLogo,
  maxW: number,
  maxH: number,
  minW = 6,
  minH = 4,
): { w: number; h: number } | null {
  if (maxW < minW || maxH < minH) return null;
  const scale = Math.min(maxW / logo.width, maxH / logo.height);
  const w = roundMm(logo.width * scale);
  const h = roundMm(logo.height * scale);
  if (w < minW || h < minH) return null;
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
