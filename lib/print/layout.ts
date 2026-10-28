import { COMMERCIAL_ARTWORK_VERSION, COUNTER_ARTWORK_VERSION, PRESS_ARTWORK_VERSION, SIGNAGE_ARTWORK_VERSION, templateSpec, type ProductArtwork, type ProductArtworkV1, type ProductArtworkV2 } from "@/lib/artwork";
import { isDarkColor } from "@/lib/color";
import { readPngLogo } from "@/lib/logo-image";
import type { QrSize } from "@/lib/product";
import { layoutCommercial } from "@/lib/print/commercial";
import { layoutCounter } from "@/lib/print/counter";
import { layoutPress } from "@/lib/print/press";
import { layoutSignage } from "@/lib/print/signage";
import { measureText, type PrintFontRole } from "@/lib/print/fonts";
import type { ArtworkScene, DrawCommand } from "@/lib/print/scene";

export type { ArtworkScene, DrawCommand } from "@/lib/print/scene";

export const PAPER = "#fffcf8";
const INK = "#14221f";

export function layoutArtwork(artwork: ProductArtwork): ArtworkScene {
  if (!artwork.href) throw new Error("artwork-href");
  if (artwork.version === PRESS_ARTWORK_VERSION) {
    const composed = layoutPress(artwork);
    if (!composed.ok) throw new Error("artwork-composition");
    return composed.scene;
  }
  if (artwork.version === SIGNAGE_ARTWORK_VERSION) {
    const composed = layoutSignage(artwork);
    if (!composed.ok) throw new Error("artwork-composition");
    return composed.scene;
  }
  if (artwork.version === COUNTER_ARTWORK_VERSION) {
    const composed = layoutCounter(artwork);
    if (!composed.ok) throw new Error("artwork-composition");
    return composed.scene;
  }
  if (artwork.version === COMMERCIAL_ARTWORK_VERSION) {
    const composed = layoutCommercial(artwork);
    if (!composed.ok) throw new Error("artwork-composition");
    return composed.scene;
  }
  if (artwork.version === 2) return layoutStudio(artwork);
  paint(artwork.foreground);
  paint(artwork.background);

  if (artwork.templateId === "tarjeta-resena") return reviewCard(artwork);
  if (artwork.templateId === "cartel-ubicacion") return locationSign(artwork);
  return sticker(artwork);
}

export function pieceComposes(artwork: ProductArtwork): boolean {
  try {
    layoutArtwork(artwork);
    return true;
  } catch {
    return false;
  }
}

export function compositionChecked(artwork: ProductArtwork): boolean {
  return (
    artwork.version === COMMERCIAL_ARTWORK_VERSION ||
    artwork.version === COUNTER_ARTWORK_VERSION ||
    artwork.version === SIGNAGE_ARTWORK_VERSION ||
    artwork.version === PRESS_ARTWORK_VERSION
  );
}

function reviewCard(artwork: ProductArtworkV1): ArtworkScene {
  const spec = templateSpec(artwork.templateId);
  const commands: DrawCommand[] = [];
  const ink = paint(artwork.foreground);
  const headerInk = isDarkColor(ink) ? "#ffffff" : INK;
  const paperInk = isDarkColor(ink) ? ink : INK;
  commands.push({ type: "rect", x: 0, y: 0, w: spec.widthMm, h: spec.heightMm, fill: PAPER, radius: 6 });
  commands.push({ type: "rect", x: 0, y: 0, w: spec.widthMm, h: 34, fill: ink });
  textBlock(commands, "RESEÑA", 6, 6, spec.widthMm - 12, 3.1, "label", headerInk, "left", 1);
  textBlock(commands, artwork.businessName, 6, 12, spec.widthMm - 12, 6, "display", headerInk, "left", 2);
  textBlock(commands, artwork.headline, 6, 40, spec.widthMm - 12, 4.2, "body", paperInk, "center", 3);
  placeQr(commands, artwork, 6, 60, spec.widthMm - 12, 64, spec.widthMm * 0.78);
  textBlock(commands, "ESCANEÁ EL CÓDIGO", 6, 128, spec.widthMm - 12, 3, "label", paperInk, "center", 1);
  return { widthMm: spec.widthMm, heightMm: spec.heightMm, clipRadius: 6, commands };
}

function locationSign(artwork: ProductArtworkV1): ArtworkScene {
  const spec = templateSpec(artwork.templateId);
  const commands: DrawCommand[] = [];
  const ink = paint(artwork.foreground);
  const paperInk = isDarkColor(ink) ? ink : INK;
  commands.push({ type: "rect", x: 0, y: 0, w: spec.widthMm, h: spec.heightMm, fill: PAPER });
  commands.push({
    type: "stroke",
    x: 4.5,
    y: 4.5,
    w: spec.widthMm - 9,
    h: spec.heightMm - 9,
    color: ink,
    width: 1.15,
  });
  const pin = 4.2;
  const label = "UBICACIÓN";
  const labelWidth = measureText("label", 3.2, label);
  const group = pin + 1.6 + labelWidth;
  const groupX = (spec.widthMm - group) / 2;
  commands.push({ type: "circle", cx: groupX + pin / 2, cy: 12.2, r: 1.35, fill: paperInk });
  commands.push({ type: "circle", cx: groupX + pin / 2, cy: 12.2, r: 0.55, fill: PAPER });
  commands.push({ type: "circle", cx: groupX + pin / 2, cy: 14.3, r: 0.38, fill: paperInk });
  textBlock(commands, label, groupX + pin + 1.6, 9.6, labelWidth + 1, 3.2, "label", paperInk, "left", 1);
  textBlock(commands, artwork.businessName, 8, 20, spec.widthMm - 16, 6.4, "display", paperInk, "center", 2);
  textBlock(commands, artwork.headline, 8, 40, spec.widthMm - 16, 4.2, "body", paperInk, "center", 3);
  placeQr(commands, artwork, 8, 62, spec.widthMm - 16, 72, spec.widthMm * 0.72);
  return { widthMm: spec.widthMm, heightMm: spec.heightMm, commands };
}

function sticker(artwork: ProductArtworkV1): ArtworkScene {
  const spec = templateSpec(artwork.templateId);
  const commands: DrawCommand[] = [];
  const ink = paint(artwork.foreground);
  const paperInk = isDarkColor(ink) ? ink : INK;
  const center = spec.widthMm / 2;
  commands.push({
    type: "circle",
    cx: center,
    cy: center,
    r: 32,
    fill: PAPER,
    stroke: ink,
    strokeWidth: 1.6,
  });
  textBlock(commands, artwork.businessName, 12, 8, spec.widthMm - 24, 3.8, "display", paperInk, "center", 2);
  textBlock(commands, artwork.headline, 12, 56, spec.widthMm - 24, 3.2, "body", paperInk, "center", 2);
  placeQr(commands, artwork, 16, 19, spec.widthMm - 32, 35, 36);
  return { widthMm: spec.widthMm, heightMm: spec.heightMm, commands };
}

function placeQr(
  commands: DrawCommand[],
  artwork: ProductArtworkV1,
  x: number,
  y: number,
  boxW: number,
  boxH: number,
  base: number,
): void {
  const size = Math.min(boxW, boxH, base * qrFactor(artwork.qrSize));
  commands.push({
    type: "qr",
    x: x + (boxW - size) / 2,
    y: y + (boxH - size) / 2,
    size,
    foreground: paint(artwork.foreground),
    background: paint(artwork.background),
    href: artwork.href ?? "",
  });
}

function textBlock(
  commands: DrawCommand[],
  text: string,
  x: number,
  y: number,
  width: number,
  size: number,
  role: PrintFontRole,
  color: string,
  align: "left" | "center",
  maxLines: number,
  options?: { letterSpacing?: number; opacity?: number; leading?: number },
): number {
  const leading = size * (options?.leading ?? 1.18);
  const spacing = options?.letterSpacing ?? 0;
  const rows = wrap(text, role, size, width, maxLines, spacing);
  rows.forEach((row, index) => {
    commands.push({
      type: "text",
      text: row,
      x,
      y: y + index * leading,
      width,
      size,
      role,
      color,
      align,
      letterSpacing: spacing === 0 ? undefined : spacing,
      opacity: options?.opacity,
    });
  });
  if (rows.length === 0) return 0;
  return (rows.length - 1) * leading + size;
}

function wrap(
  text: string,
  role: PrintFontRole,
  size: number,
  width: number,
  maxLines: number,
  letterSpacing = 0,
): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current.length > 0 ? `${current} ${word}` : word;
    if (current.length === 0 || measureText(role, size, next, letterSpacing) <= width) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current.length > 0) lines.push(current);
  if (lines.length === 0) return [];
  if (lines.length <= maxLines) return lines.map((line) => fit(line, role, size, width, letterSpacing));

  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1] ?? "";
  kept[maxLines - 1] = fit(last.endsWith("…") ? last : `${last}…`, role, size, width, letterSpacing);
  return kept;
}

function fit(text: string, role: PrintFontRole, size: number, width: number, letterSpacing = 0): string {
  if (measureText(role, size, text, letterSpacing) <= width) return text;
  let value = text.replace(/…$/, "");
  while (value.length > 1 && measureText(role, size, `${value}…`, letterSpacing) > width) {
    value = value.slice(0, -1);
  }
  const clipped = `${value}…`;
  return measureText(role, size, clipped, letterSpacing) <= width ? clipped : value;
}

function qrFactor(size: QrSize): number {
  if (size === 192) return 0.82;
  if (size === 256) return 0.91;
  return 1;
}

function paint(value: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error("artwork-color");
  return value.toLowerCase();
}

const DESIGN_PX = 352;

function layoutStudio(artwork: ProductArtworkV2): ArtworkScene {
  const surface = paint(artwork.surface);
  const ink = paint(artwork.ink);
  const accent = paint(artwork.accent);
  paint(artwork.foreground);
  paint(artwork.background);
  if (artwork.templateId === "minimal-elegance") return minimalStudio(artwork, surface, ink, accent);
  if (artwork.templateId === "dark-premium") return darkStudio(artwork, surface, ink, accent);
  return brandStudio(artwork, surface, ink, accent);
}

function minimalStudio(artwork: ProductArtworkV2, surface: string, ink: string, accent: string): ArtworkScene {
  const width = 90;
  const height = 140;
  const commands: DrawCommand[] = [];
  const radius = cssPx(width, 27.2);
  commands.push({ type: "rect", x: 0, y: 0, w: width, h: height, fill: surface, radius });
  insetStroke(commands, width, height, 0.045, cssPx(width, 18.4), accent, cssPx(width, 1), 1);
  insetStroke(commands, width, height, 0.062, cssPx(width, 14.4), accent, cssPx(width, 1), 0.4);

  const padX = width * 0.14;
  const padTop = height * 0.16;
  const padBottom = height * 0.12;
  const innerW = width - padX * 2;
  const column = innerW * 0.68;
  const qrSide = column * qrFactor(artwork.qrSize);
  const qrTop = height - padBottom - qrSide;
  let y = padTop;
  const logo = cssPx(width, 48);
  if (artwork.logo) {
    placeLogo(commands, artwork, (width - logo) / 2, y, logo, logo / 2, false, accent, ink);
    y += logo + cssPx(width, 12);
  }
  y += placeTracked(commands, artwork.serviceLine, padX, y, innerW, cssPx(width, 10), "sourceMedium", accent, "center", 0.28);
  y += cssPx(width, 12);
  const titleRoom = qrTop - cssPx(width, 18) - y;
  y += placeFitted(
    commands,
    artwork.businessName,
    padX,
    y,
    innerW,
    cssPx(width, 26.4),
    titleRole(artwork),
    ink,
    "center",
    3,
    titleRoom,
    { letterSpacing: -0.03, leading: 1.05 },
  );
  y += cssPx(width, 12);
  const rule = cssPx(width, 40);
  if (y + cssPx(width, 1) < qrTop - cssPx(width, 8)) {
    commands.push({ type: "rect", x: (width - rule) / 2, y, w: rule, h: cssPx(width, 1), fill: accent });
    y += cssPx(width, 12);
  }
  placeFitted(
    commands,
    artwork.subtitle,
    padX,
    y,
    innerW,
    cssPx(width, 14),
    "body",
    ink,
    "center",
    3,
    qrTop - cssPx(width, 8) - y,
    { leading: 1.25, opacity: 0.8 },
  );
  placeStudioQr(commands, artwork, (width - qrSide) / 2, qrTop, qrSide, width);
  return { widthMm: width, heightMm: height, clipRadius: radius, commands };
}

function darkStudio(artwork: ProductArtworkV2, surface: string, ink: string, accent: string): ArtworkScene {
  const width = 105;
  const height = 148;
  const commands: DrawCommand[] = [];
  const radius = cssPx(width, 20);
  const padX = cssPx(width, 24);
  const padTop = cssPx(width, 28);
  const padBottom = cssPx(width, 24);
  const bar = cssPx(width, 6);
  commands.push({ type: "rect", x: 0, y: 0, w: width, h: height, fill: surface, radius });
  commands.push({ type: "rect", x: 0, y: 0, w: bar, h: height, fill: accent });

  const innerX = padX;
  const innerW = width - padX * 2;
  const logo = cssPx(width, 48);
  const gap = cssPx(width, 12);
  const textW = innerW - logo - gap;
  let y = padTop;
  placeLogo(commands, artwork, width - padX - logo, y, logo, cssPx(width, 16), false, accent, ink);
  y += placeTracked(commands, artwork.serviceLine, innerX, y, textW, cssPx(width, 10), "sourceMedium", accent, "left", 0.24);
  y += cssPx(width, 12);
  const column = innerW * 0.48;
  const qrSide = column * qrFactor(artwork.qrSize);
  const qrTop = height - padBottom - qrSide;
  const subtitleReserve = cssPx(width, 14) * 1.45 * 2 + cssPx(width, 24);
  y += placeFitted(
    commands,
    artwork.businessName,
    innerX,
    y,
    textW,
    cssPx(width, 32),
    titleRole(artwork),
    ink,
    "left",
    3,
    qrTop - subtitleReserve - y,
    { letterSpacing: -0.03, leading: 0.98 },
  );
  y = Math.max(y, padTop + logo) + cssPx(width, 20);
  placeFitted(
    commands,
    artwork.subtitle,
    innerX,
    y,
    Math.min(innerW, cssPx(width, 240)),
    cssPx(width, 14),
    "body",
    ink,
    "left",
    4,
    qrTop - cssPx(width, 10) - y,
    { leading: 1.45, opacity: 0.75 },
  );
  const line = cssPx(width, 56);
  commands.push({
    type: "rect",
    x: innerX,
    y: height - padBottom - cssPx(width, 8) - line,
    w: cssPx(width, 1),
    h: line,
    fill: accent,
  });
  const qrX = width - padX - column + (column - qrSide) / 2;
  placeStudioQr(commands, artwork, qrX, qrTop, qrSide, width);
  return { widthMm: width, heightMm: height, clipRadius: radius, commands };
}

function brandStudio(artwork: ProductArtworkV2, surface: string, ink: string, accent: string): ArtworkScene {
  const width = 100;
  const height = 150;
  const commands: DrawCommand[] = [];
  const radius = cssPx(width, 21.6);
  const rail = width * 0.36;
  const onAccent = isDarkColor(accent) ? "#f8f6f1" : "#14221f";
  commands.push({ type: "rect", x: 0, y: 0, w: width, h: height, fill: surface, radius });
  commands.push({ type: "rect", x: 0, y: 0, w: rail, h: height, fill: accent });

  const railPadX = cssPx(width, 12);
  const railPadY = cssPx(width, 24);
  const logo = cssPx(width, 48);
  placeLogo(commands, artwork, (rail - logo) / 2, railPadY, logo, logo / 2, true, onAccent, onAccent);
  const titleW = rail - railPadX * 2;
  const titleSize = cssPx(width, 14);
  const titleTop = railPadY + logo + cssPx(width, 12);
  const serviceSize = cssPx(width, 9);
  const serviceTop = height - railPadY - serviceSize;
  const titleGap = cssPx(width, 8);
  const titleRoom = serviceTop - titleGap - titleTop;
  const titleLeading = 1.2;
  const titleLines = Math.max(1, Math.min(5, Math.floor(titleRoom / (titleSize * titleLeading))));
  const titleRows = wrap(artwork.businessName, titleRole(artwork), titleSize, titleW, titleLines, -0.03);
  const titleSpan = titleRows.length === 0 ? 0 : (titleRows.length - 1) * titleSize * titleLeading + titleSize;
  const titleY = titleTop + Math.max(0, (titleRoom - titleSpan) / 2);
  textBlock(commands, artwork.businessName, railPadX, titleY, titleW, titleSize, titleRole(artwork), onAccent, "center", titleLines, {
    letterSpacing: -0.03,
    leading: titleLeading,
  });
  placeTracked(
    commands,
    artwork.serviceLine,
    railPadX,
    serviceTop,
    titleW,
    serviceSize,
    "sourceMedium",
    onAccent,
    "center",
    0.16,
    0.8,
  );

  const padX = cssPx(width, 16);
  const padY = cssPx(width, 24);
  const contentX = rail + padX;
  const contentW = width - rail - padX * 2;
  let y = padY;
  y += placeTracked(commands, "Escaneá", contentX, y, contentW, cssPx(width, 10), "sourceMedium", accent, "left", 0.18);
  y += cssPx(width, 12);
  const qrSide = contentW * qrFactor(artwork.qrSize);
  const qrTop = height - padY - qrSide;
  placeFitted(
    commands,
    artwork.subtitle,
    contentX,
    y,
    contentW,
    cssPx(width, 14),
    "body",
    ink,
    "left",
    5,
    qrTop - cssPx(width, 8) - y,
    { leading: 1.25 },
  );
  placeStudioQr(commands, artwork, contentX, qrTop, qrSide, width);
  return { widthMm: width, heightMm: height, clipRadius: radius, commands };
}

function placeLogo(
  commands: DrawCommand[],
  artwork: ProductArtworkV2,
  x: number,
  y: number,
  size: number,
  radius: number,
  onBand: boolean,
  accent: string,
  ink: string,
): void {
  if (artwork.logo) {
    const logo = readPngLogo(artwork.logo.data);
    if (!logo || logo.width !== artwork.logo.width || logo.height !== artwork.logo.height) {
      throw new Error("artwork-logo");
    }
    commands.push({ type: "image", x, y, w: size, h: size, data: logo.data, radius });
    if (onBand) {
      commands.push({
        type: "stroke",
        x,
        y,
        w: size,
        h: size,
        color: "#ffffff",
        width: cssPx(100, 2),
        radius,
        opacity: 0.7,
      });
    }
    return;
  }
  if (artwork.templateId === "minimal-elegance") return;

  const letter = artwork.businessName.trim().charAt(0).toLocaleUpperCase("es") || "A";
  if (onBand) {
    commands.push({ type: "circle", cx: x + size / 2, cy: y + size / 2, r: size / 2, fill: "#ffffff", opacity: 0.16 });
  } else {
    commands.push({
      type: "circle",
      cx: x + size / 2,
      cy: y + size / 2,
      r: size / 2,
      stroke: accent,
      strokeWidth: cssPx(105, 1),
    });
  }
  const fontSize = size * 0.38;
  commands.push({
    type: "text",
    text: letter,
    x,
    y: y + (size - fontSize) * 0.34,
    width: size,
    size: fontSize,
    role: "label",
    color: onBand ? ink : accent,
    align: "center",
  });
}

function placeStudioQr(
  commands: DrawCommand[],
  artwork: ProductArtworkV2,
  x: number,
  y: number,
  side: number,
  cardWidth: number,
): void {
  const href = artwork.href;
  if (!href) throw new Error("artwork-href");
  const inset = Math.min(cssPx(cardWidth, 6), side * 0.08);
  const qr = side - inset * 2;
  commands.push({ type: "rect", x, y, w: side, h: side, fill: paint(artwork.background) });
  commands.push({
    type: "qr",
    x: x + inset,
    y: y + inset,
    size: qr,
    foreground: paint(artwork.foreground),
    background: paint(artwork.background),
    href,
  });
}

function placeTracked(
  commands: DrawCommand[],
  text: string,
  x: number,
  y: number,
  width: number,
  size: number,
  role: PrintFontRole,
  color: string,
  align: "left" | "center",
  tracking: number,
  opacity = 1,
): number {
  let spacing = tracking;
  const upper = text.toLocaleUpperCase("es");
  while (spacing > 0.02 && measureText(role, size, upper, spacing) > width) spacing -= 0.02;
  return textBlock(commands, upper, x, y, width, size, role, color, align, 2, {
    letterSpacing: Math.round(spacing * 100) / 100,
    opacity,
    leading: 1.15,
  });
}

function placeFitted(
  commands: DrawCommand[],
  text: string,
  x: number,
  y: number,
  width: number,
  size: number,
  role: PrintFontRole,
  color: string,
  align: "left" | "center",
  maxLines: number,
  available: number,
  options?: { letterSpacing?: number; opacity?: number; leading?: number },
): number {
  const leading = options?.leading ?? 1.18;
  if (available < size * 0.9 || width < 4) return 0;
  const lines = Math.max(1, Math.min(maxLines, Math.floor((available + size * 0.2) / (size * leading))));
  let nextSize = size;
  while (nextSize > size * 0.72 && measureText(role, nextSize, text, options?.letterSpacing ?? 0) > width * lines) {
    nextSize *= 0.92;
  }
  return textBlock(commands, text, x, y, width, nextSize, role, color, align, lines, {
    ...options,
    leading,
  });
}

function insetStroke(
  commands: DrawCommand[],
  width: number,
  height: number,
  inset: number,
  radius: number,
  color: string,
  strokeWidth: number,
  opacity: number,
): void {
  const x = width * inset;
  const y = height * inset;
  commands.push({
    type: "stroke",
    x,
    y,
    w: width - x * 2,
    h: height - y * 2,
    color,
    width: strokeWidth,
    radius,
    opacity,
  });
}

function titleRole(artwork: ProductArtworkV2): PrintFontRole {
  const brand = artwork.templateId === "brand-identity";
  if (artwork.fontId === "fraunces") return brand ? "frauncesBold" : "fraunces";
  if (artwork.fontId === "source") return brand ? "label" : "sourceMedium";
  return brand ? "display" : "sora";
}

function cssPx(cardWidthMm: number, pixels: number): number {
  return (pixels / DESIGN_PX) * cardWidthMm;
}
