import { shopStripeReadable } from "@/lib/color";
import { premiumPhrases, type ArtworkLogo, type PremiumTemplateId, type ProductArtworkV7 } from "@/lib/artwork";
import type { CommercialIssue } from "@/lib/print/commercial-issues";
import { fitText, type FittedText } from "@/lib/print/fit-text";
import { measureText, type PrintFontRole } from "@/lib/print/fonts";
import type { ArtworkScene, DrawCommand } from "@/lib/print/scene";

const CLASSIC_PAPER = "#fffcf8";
const CLASSIC_INK = "#1c1915";
const CLASSIC_GOLD = "#a16207";
const VIVID_PINE = "#0c3b32";
const VIVID_CLAY = "#ff4d00";
const VIVID_CREAM = "#f3ecdf";
const DARK_FIELD = "#121417";
const DARK_GOLD = "#ffb000";
const CREAM = "#f7f4ee";
const SHOP_PAPER = "#f7f1e8";
const SHOP_INK = "#1c1915";
const WHITE = "#ffffff";
const GOOGLE_BLUE = "#1a73e8";
const GOOGLE_YELLOW = "#fbbc04";
const GOOGLE_GREEN = "#188038";

/** Instruction type on the 80 × 80 mm sticker. Larger than the proposal so it reads in the hand. */
export const STICKER_INSTRUCTION_MM = 5.2;

const lockedAccent: Record<Exclude<PremiumTemplateId, "stand-shop">, string> = {
  "stand-classic": CLASSIC_GOLD,
  "stand-vivid": VIVID_CLAY,
  "stand-dark": DARK_GOLD,
};

export function premiumAccent(templateId: PremiumTemplateId, requested: string): string {
  if (templateId === "stand-shop") return requested;
  return lockedAccent[templateId];
}

type PremiumResult = { ok: true; scene: ArtworkScene } | { ok: false; error: CommercialIssue };

type Sheet = {
  commands: DrawCommand[];
  width: number;
  height: number;
  failed: boolean;
};

export function layoutPremium(artwork: ProductArtworkV7): PremiumResult {
  if (!artwork.href) return { ok: false, error: "composition" };
  if (artwork.templateId === "stand-shop" && !shopStripeReadable(artwork.accent)) {
    return { ok: false, error: "accent-contrast" };
  }
  const sheet = blank(artwork.format === "poster" ? 105 : 80, artwork.format === "poster" ? 148 : 80);
  if (artwork.format === "poster") paintPoster(sheet, artwork);
  else paintSticker(sheet, artwork);
  if (sheet.failed) return { ok: false, error: "composition" };
  return {
    ok: true,
    scene: { widthMm: sheet.width, heightMm: sheet.height, clipRadius: 2.2, commands: sheet.commands },
  };
}

function paintPoster(sheet: Sheet, artwork: ProductArtworkV7): void {
  if (artwork.templateId === "stand-classic") paintClassicPoster(sheet, artwork);
  else if (artwork.templateId === "stand-vivid") paintVividPoster(sheet, artwork);
  else if (artwork.templateId === "stand-dark") paintDarkPoster(sheet, artwork);
  else paintShopPoster(sheet, artwork);
}

function paintSticker(sheet: Sheet, artwork: ProductArtworkV7): void {
  if (artwork.templateId === "stand-classic") paintClassicSticker(sheet, artwork);
  else if (artwork.templateId === "stand-vivid") paintVividSticker(sheet, artwork);
  else if (artwork.templateId === "stand-dark") paintDarkSticker(sheet, artwork);
  else paintShopSticker(sheet, artwork);
}

function paintClassicPoster(sheet: Sheet, artwork: ProductArtworkV7): void {
  const review = artwork.objective === "review";
  const phrase = premiumPhrases(artwork.templateId, artwork.objective, artwork.message);
  rect(sheet, 0, 0, sheet.width, sheet.height, CLASSIC_PAPER);
  let y = 10;
  if (artwork.logo || artwork.businessName) {
    y = lockup(sheet, artwork, 8, y, CLASSIC_INK, "frauncesBold", 5.2, 14).bottom + 4;
  }
  const shout = layoutShout(phrase.shout, "frauncesBold", sheet.width - 16, 7.6, 5.6, 2, 1.12, false);
  if (!shout) {
    sheet.failed = true;
    return;
  }
  writeBlock(sheet, shout, 8, y, sheet.width - 16, "frauncesBold", CLASSIC_INK, "center");
  y += shout.height;
  if (review) y = stars(sheet, sheet.width / 2, y + 1.4 + 2.6, 2.6, 1.8, CLASSIC_GOLD, "center") + 2.4;
  else y += 3;
  const qr = artwork.logo || artwork.businessName ? 50 : 54;
  const qrX = (sheet.width - qr) / 2;
  stroke(sheet, qrX - 2.8, y, qr + 5.6, qr + 5.6, CLASSIC_INK, 0.25);
  stroke(sheet, qrX - 1.6, y + 1.2, qr + 3.2, qr + 3.2, CLASSIC_INK, 0.12);
  placeQr(sheet, qrX, y + 2.8, qr, CLASSIC_INK, WHITE, artwork.href ?? "");
  instruction(
    sheet,
    review ? ["Escaneá y dejanos tu reseña", "en Google"] : ["Escaneá para llegar", "en Google Maps"],
    8,
    y + qr + 8,
    sheet.width - 16,
    5.6,
    "label",
    CLASSIC_INK,
    "center",
    1.2,
  );
}

function paintClassicSticker(sheet: Sheet, artwork: ProductArtworkV7): void {
  const review = artwork.objective === "review";
  const phrase = premiumPhrases(artwork.templateId, artwork.objective, artwork.message);
  rect(sheet, 0, 0, sheet.width, sheet.height, CLASSIC_PAPER);
  let y = 4.4;
  if (artwork.logo) {
    placeLogo(sheet, artwork.logo, (sheet.width - 9) / 2, y, 9);
    y += 10.2;
  } else if (artwork.businessName) {
    y = lines(sheet, [artwork.businessName], 4, y, sheet.width - 8, 4, "frauncesBold", CLASSIC_INK, "center", 1.05) + 0.8;
  }
  const shout = layoutShout(phrase.shout, "frauncesBold", sheet.width - 8, 5.8, 4.6, 2, 1.05, false);
  if (!shout) {
    sheet.failed = true;
    return;
  }
  writeBlock(sheet, shout, 4, y, sheet.width - 8, "frauncesBold", CLASSIC_INK, "center");
  y += shout.height;
  if (review) y = stars(sheet, sheet.width / 2, y + 1.1 + 1.55, 1.55, 1.05, CLASSIC_GOLD, "center") + 1.2;
  else y += 1.4;
  const qr = 32;
  const qrX = (sheet.width - qr) / 2;
  placeQr(sheet, qrX, y, qr, CLASSIC_INK, WHITE, artwork.href ?? "");
  instruction(
    sheet,
    review ? ["Escaneá y dejanos", "tu reseña en Google"] : ["Escaneá para llegar", "en Google Maps"],
    3,
    y + qr + 2.4,
    sheet.width - 6,
    STICKER_INSTRUCTION_MM,
    "label",
    CLASSIC_INK,
    "center",
    1.12,
  );
}

function paintVividPoster(sheet: Sheet, artwork: ProductArtworkV7): void {
  const review = artwork.objective === "review";
  const phrase = premiumPhrases(artwork.templateId, artwork.objective, artwork.message);
  rect(sheet, 0, 0, sheet.width, sheet.height, VIVID_CREAM);
  rect(sheet, 0, 0, 16.8, sheet.height, VIVID_PINE);
  const insertAt = sheet.commands.length;
  let y = 8;
  if (artwork.logo || artwork.businessName) {
    y = lockup(sheet, artwork, 20, y, WHITE, "label", 4.4, 12).bottom + 2;
  }
  const shout = layoutShout(phrase.shout, "label", 78, review ? 10 : 8.4, 6.2, 2, 1.02, true);
  if (!shout) {
    sheet.failed = true;
    return;
  }
  writeBlock(sheet, shout, 20, y, 78, "label", WHITE, "left");
  y += shout.height;
  const starR = 2.15;
  const starCy = y + 1.6 + starR;
  if (review) stars(sheet, 22, starCy, starR, 1.25, WHITE, "left");
  const band = review ? starCy + starR + 2.1 : y + 4;
  sheet.commands.splice(insertAt, 0, { type: "rect", x: 16.8, y: 0, w: sheet.width - 16.8, h: band, fill: VIVID_CLAY });
  const qr = artwork.logo || artwork.businessName ? 44 : 50;
  const qrY = band + 6;
  rect(sheet, 12, band + 2.8, 86, qr + 8, WHITE);
  placeQr(sheet, 26, qrY, qr, CLASSIC_INK, WHITE, artwork.href ?? "");
  instruction(
    sheet,
    review ? ["Escaneá acá", "en Google"] : ["Escaneá para llegar", "en Google Maps"],
    20,
    qrY + qr + 8,
    78,
    6,
    "label",
    CLASSIC_INK,
    "left",
    1.18,
  );
}

function paintVividSticker(sheet: Sheet, artwork: ProductArtworkV7): void {
  const review = artwork.objective === "review";
  const phrase = premiumPhrases(artwork.templateId, artwork.objective, artwork.message);
  rect(sheet, 0, 0, sheet.width, sheet.height, VIVID_CREAM);
  const insertAt = sheet.commands.length;
  let y = artwork.logo || artwork.businessName ? 4.6 : 5.4;
  if (artwork.logo || artwork.businessName) {
    y = lockup(sheet, artwork, 4, y, WHITE, "label", 3.4, 8).bottom + 0.6;
  }
  const shout = layoutShout(phrase.shout, "label", 72, review ? 5.4 : 4.6, 4.2, 2, 1.02, false);
  if (!shout) {
    sheet.failed = true;
    return;
  }
  writeBlock(sheet, shout, 4, y, 72, "label", WHITE, "left");
  y += shout.height;
  const starR = 1.6;
  const starCy = y + 1 + starR;
  if (review) stars(sheet, 6, starCy, starR, 0.95, WHITE, "left");
  const band = review ? starCy + starR + 1.15 : y + 2.2;
  sheet.commands.splice(
    insertAt,
    0,
    { type: "rect", x: 0, y: 0, w: sheet.width, h: band, fill: VIVID_PINE },
    { type: "rect", x: 0, y: 0, w: sheet.width, h: 3.2, fill: VIVID_CLAY },
  );
  const qr = 32;
  const qrY = band + 2.2;
  rect(sheet, 4, band + 1, 72, qr + 2.8, WHITE);
  placeQr(sheet, (sheet.width - qr) / 2, qrY, qr, CLASSIC_INK, WHITE, artwork.href ?? "");
  instruction(
    sheet,
    review ? ["Escaneá acá", "en Google"] : ["Escaneá para llegar", "en Google Maps"],
    4,
    qrY + qr + 2.4,
    sheet.width - 8,
    STICKER_INSTRUCTION_MM,
    "label",
    CLASSIC_INK,
    "center",
    1.12,
  );
}

function paintDarkPoster(sheet: Sheet, artwork: ProductArtworkV7): void {
  const review = artwork.objective === "review";
  const phrase = premiumPhrases(artwork.templateId, artwork.objective, artwork.message);
  rect(sheet, 0, 0, sheet.width, sheet.height, DARK_FIELD);
  rect(sheet, 0, 0, sheet.width, 5.2, DARK_GOLD);
  let y = 12;
  const branded = Boolean(artwork.logo || artwork.businessName);
  if (branded) {
    y = lockup(sheet, artwork, 8, y, CREAM, "label", 4.2, 12).bottom + 2;
  }
  const shout = layoutShout(phrase.shout, "label", sheet.width - 16, branded ? 9.2 : 11, 6.4, 2, 1.02, true);
  if (!shout) {
    sheet.failed = true;
    return;
  }
  writeBlock(sheet, shout, 8, y, sheet.width - 16, "label", CREAM, "left");
  y += shout.height;
  if (review) y = stars(sheet, sheet.width / 2, y + 1.4 + 2.5, 2.5, 1.45, DARK_GOLD, "center") + 2.6;
  else y += 4;
  const qr = branded ? 50 : 56;
  const qrX = (sheet.width - qr) / 2;
  rect(sheet, qrX - 2.4, y - 2.4, qr + 4.8, qr + 4.8, WHITE);
  placeQr(sheet, qrX, y, qr, DARK_FIELD, WHITE, artwork.href ?? "");
  instruction(
    sheet,
    review ? ["Escaneá acá", "en Google"] : ["Escaneá para llegar", "en Google Maps"],
    8,
    y + qr + 6,
    sheet.width - 16,
    6,
    "label",
    CREAM,
    "center",
    1.2,
  );
}

function paintDarkSticker(sheet: Sheet, artwork: ProductArtworkV7): void {
  const review = artwork.objective === "review";
  const phrase = premiumPhrases(artwork.templateId, artwork.objective, artwork.message);
  rect(sheet, 0, 0, sheet.width, sheet.height, DARK_FIELD);
  rect(sheet, 0, 0, sheet.width, 2.8, DARK_GOLD);
  let y = artwork.logo || artwork.businessName ? 4.6 : 5.2;
  if (artwork.logo || artwork.businessName) {
    y = lockup(sheet, artwork, 4, y, CREAM, "label", 3.2, 8).bottom + 0.6;
  }
  const shout = layoutShout(phrase.shout, "label", 72, 5.6, 4.2, 2, 1.02, false);
  if (!shout) {
    sheet.failed = true;
    return;
  }
  writeBlock(sheet, shout, 4, y, 72, "label", CREAM, "left");
  y += shout.height;
  if (review) stars(sheet, 6, y + 1.1 + 1.45, 1.45, 0.9, DARK_GOLD, "left");
  const qr = 28;
  const qrY = 30;
  const qrX = (sheet.width - qr) / 2;
  rect(sheet, qrX - 1.6, qrY - 1.6, qr + 3.2, qr + 3.2, WHITE);
  placeQr(sheet, qrX, qrY, qr, DARK_FIELD, WHITE, artwork.href ?? "");
  instruction(
    sheet,
    review ? ["Escaneá acá", "en Google"] : ["Escaneá para llegar", "en Google Maps"],
    3,
    qrY + qr + 3,
    sheet.width - 6,
    STICKER_INSTRUCTION_MM,
    "label",
    CREAM,
    "center",
    1.12,
  );
}

function paintShopPoster(sheet: Sheet, artwork: ProductArtworkV7): void {
  const review = artwork.objective === "review";
  const phrase = premiumPhrases(artwork.templateId, artwork.objective, artwork.message);
  const accent = artwork.accent;
  rect(sheet, 0, 0, sheet.width, sheet.height, SHOP_PAPER);
  let y = 7;
  if (artwork.logo || artwork.businessName) {
    const brand = lockup(sheet, artwork, 8, y, SHOP_INK, "label", artwork.logo ? 8.4 : 13, artwork.logo ? 16 : 18);
    y = brand.bottom + 2.2;
    if (review) y = stars(sheet, brand.textX, y + 1.2 + 2.4, 2.4, 1.5, accent, "left") + 2.6;
  }
  const bandH = 22;
  rect(sheet, 0, y, sheet.width, bandH, accent);
  const shout = layoutShout(phrase.shout, "label", sheet.width - 12, 7.4, 5.6, 1, 1, false);
  if (!shout) {
    sheet.failed = true;
    return;
  }
  writeBlock(sheet, shout, 6, y + 2.2, sheet.width - 12, "label", WHITE, "center");
  instruction(
    sheet,
    [review ? "Escaneá acá, en Google" : "Escaneá para llegar"],
    6,
    y + 11.4,
    sheet.width - 12,
    5.6,
    "label",
    WHITE,
    "center",
    1,
  );
  const qr = 64;
  placeQr(sheet, (sheet.width - qr) / 2, y + bandH + 5, qr, SHOP_INK, WHITE, artwork.href ?? "");
}

function paintShopSticker(sheet: Sheet, artwork: ProductArtworkV7): void {
  const review = artwork.objective === "review";
  const phrase = premiumPhrases(artwork.templateId, artwork.objective, artwork.message);
  const accent = artwork.accent;
  rect(sheet, 0, 0, sheet.width, sheet.height, SHOP_PAPER);
  let y = 3.4;
  if (artwork.logo || artwork.businessName) {
    y = lockup(sheet, artwork, 4, y, SHOP_INK, "label", 4.2, 8).bottom + 1.4;
  }
  const bandH = 16;
  rect(sheet, 0, y, sheet.width, bandH, accent);
  const shout = layoutShout(phrase.shout, "label", sheet.width - 6, 5.2, 4.4, 1, 1, false);
  if (!shout) {
    sheet.failed = true;
    return;
  }
  writeBlock(sheet, shout, 3, y + 1.2, sheet.width - 6, "label", WHITE, "center");
  instruction(
    sheet,
    [review ? "Escaneá acá, en Google" : "Escaneá para llegar"],
    3,
    y + 8,
    sheet.width - 6,
    STICKER_INSTRUCTION_MM,
    "label",
    WHITE,
    "center",
    1,
  );
  const qr = 32;
  placeQr(sheet, (sheet.width - qr) / 2, y + bandH + 2.4, qr, SHOP_INK, WHITE, artwork.href ?? "");
}

function lockup(
  sheet: Sheet,
  artwork: ProductArtworkV7,
  x: number,
  y: number,
  color: string,
  role: PrintFontRole,
  size: number,
  logoMax: number,
): { bottom: number; textX: number } {
  let textX = x;
  let textW = sheet.width - x - 6;
  let height = 0;
  if (artwork.logo) {
    const box = placeLogo(sheet, artwork.logo, x, y, logoMax);
    textX = x + box.w + 2.4;
    textW = sheet.width - textX - 6;
    height = box.h;
  }
  if (artwork.businessName && textW > 8) {
    const fitted = fitText({
      text: artwork.businessName,
      role,
      width: textW,
      maxSize: size,
      minSize: 3.2,
      maxLines: 2,
      leading: 1.05,
    });
    if (!fitted) {
      sheet.failed = true;
      return { bottom: y, textX };
    }
    writeFitted(sheet, fitted.lines, textX, y, textW, fitted.size, role, color, "left");
    height = Math.max(height, fitted.height);
  }
  return { bottom: y + height, textX };
}

function layoutShout(
  text: string,
  role: PrintFontRole,
  width: number,
  maxSize: number,
  minSize: number,
  maxLines: number,
  leading: number,
  stack: boolean,
): FittedText | null {
  const fitted = fitText({ text, role, width, maxSize, minSize, maxLines, leading });
  if (!fitted || !stack || fitted.lines.length !== 1 || maxLines < 2) return fitted;
  const words = text.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length < 2) return fitted;
  let best: [string, string] | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const left = words.slice(0, index).join(" ");
    const right = words.slice(index).join(" ");
    const leftWidth = measureText(role, fitted.size, left);
    const rightWidth = measureText(role, fitted.size, right);
    if (leftWidth > width || rightWidth > width) continue;
    const diff = Math.abs(leftWidth - rightWidth);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = [left, right];
    }
  }
  if (!best) return fitted;
  return { ...fitted, lines: best, height: fitted.lineHeight * 2 };
}

function writeBlock(
  sheet: Sheet,
  fitted: FittedText,
  x: number,
  y: number,
  width: number,
  role: PrintFontRole,
  color: string,
  align: "left" | "center",
): void {
  fitted.lines.forEach((row, index) => {
    write(sheet, row, x, y + index * fitted.lineHeight, width, fitted.size, role, color, align);
  });
}

function instruction(
  sheet: Sheet,
  rows: string[],
  x: number,
  y: number,
  width: number,
  size: number,
  role: PrintFontRole,
  color: string,
  align: "left" | "center",
  leading: number,
): void {
  rows.forEach((row, index) => {
    const lineY = y + index * size * leading;
    write(sheet, row, x, lineY, width, size, role, color, align);
  });
  const last = y + (rows.length - 1) * size * leading;
  if (sheet.height <= 80 && last + size > sheet.height - 5.4) sheet.failed = true;
}

function markGoogle(
  sheet: Sheet,
  text: string,
  x: number,
  y: number,
  width: number,
  size: number,
  role: PrintFontRole,
  align: "left" | "center",
): void {
  const word = "Google";
  const lineW = measureText(role, size, text);
  const origin = align === "center" ? x + Math.max(0, (width - lineW) / 2) : x;
  const barH = Math.max(1.8, size * 0.32);
  let from = 0;
  while (from < text.length) {
    const at = text.indexOf(word, from);
    if (at < 0) return;
    const beforeW = measureText(role, size, text.slice(0, at));
    const wordW = measureText(role, size, word);
    const wordX = origin + beforeW;
    const gap = Math.max(0.15, wordW * 0.035);
    const barW = (wordW - gap * 2) / 3;
    let barY = y + size * 1.02;
    const limit = sheet.height - 0.8;
    if (barY + barH > limit) barY = Math.max(y + size * 0.7, limit - barH);
    if (barW >= 0.4 && barY + barH <= limit) {
      [GOOGLE_BLUE, GOOGLE_YELLOW, GOOGLE_GREEN].forEach((fill, index) => {
        rect(sheet, wordX + index * (barW + gap), barY, barW, barH, fill);
      });
    }
    from = at + word.length;
  }
}

function lines(
  sheet: Sheet,
  rows: string[],
  x: number,
  y: number,
  width: number,
  size: number,
  role: PrintFontRole,
  color: string,
  align: "left" | "center",
  leading: number,
): number {
  rows.forEach((row, index) => {
    write(sheet, row, x, y + index * size * leading, width, size, role, color, align);
  });
  return y + rows.length * size * leading;
}

function write(
  sheet: Sheet,
  text: string,
  x: number,
  y: number,
  width: number,
  size: number,
  role: PrintFontRole,
  color: string,
  align: "left" | "center",
): void {
  if (sheet.failed) return;
  const measured = measureText(role, size, text);
  if (measured > width + 0.05 || x < 0 || y < 0 || y + size > sheet.height - 0.6) {
    sheet.failed = true;
    return;
  }
  sheet.commands.push({ type: "text", text, x, y, width, size, role, color, align });
  if (text.includes("Google")) markGoogle(sheet, text, x, y, width, size, role, align);
}

function writeFitted(
  sheet: Sheet,
  rows: string[],
  x: number,
  y: number,
  width: number,
  size: number,
  role: PrintFontRole,
  color: string,
  align: "left" | "center",
): void {
  rows.forEach((row, index) => write(sheet, row, x, y + index * size * 1.05, width, size, role, color, align));
}

function stars(
  sheet: Sheet,
  x: number,
  y: number,
  radius: number,
  gap: number,
  fill: string,
  align: "left" | "center",
): number {
  const step = radius * 2 + gap;
  const origin = align === "center" ? x - step * 2 : x + radius;
  for (let index = 0; index < 5; index += 1) {
    const cx = origin + index * step;
    if (cx - radius < 0 || cx + radius > sheet.width || y + radius > sheet.height) sheet.failed = true;
    sheet.commands.push({ type: "star", cx, cy: y, r: radius, fill });
  }
  return y + radius;
}

function placeLogo(sheet: Sheet, logo: ArtworkLogo, x: number, y: number, max: number): { w: number; h: number } {
  const aspect = logo.width / logo.height;
  const w = aspect >= 1 ? max : max * aspect;
  const h = aspect >= 1 ? max / aspect : max;
  sheet.commands.push({
    type: "image",
    x,
    y,
    w,
    h,
    data: logo.data,
    radius: Math.min(w, h) * 0.16,
  });
  return { w, h };
}

function placeQr(sheet: Sheet, x: number, y: number, size: number, foreground: string, background: string, href: string): void {
  if (x < 1 || y < 1 || x + size > sheet.width - 1 || y + size > sheet.height - 1) sheet.failed = true;
  sheet.commands.push({ type: "qr", x, y, size, foreground, background, href });
}

function rect(sheet: Sheet, x: number, y: number, w: number, h: number, fill: string): void {
  sheet.commands.push({ type: "rect", x, y, w, h, fill });
}

function stroke(sheet: Sheet, x: number, y: number, w: number, h: number, color: string, width: number): void {
  sheet.commands.push({ type: "stroke", x, y, w, h, color, width });
}

function blank(width: number, height: number): Sheet {
  return { commands: [], width, height, failed: false };
}
