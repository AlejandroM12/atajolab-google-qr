import { isDarkColor, isHexColor } from "@/lib/color";
import { clamp, mm, normalizeRotation } from "@/lib/studio/geometry";
import { imageSrcIssue } from "@/lib/studio/images";
import { clampQrGeometry, qrContrastIssue } from "@/lib/studio/qr-rules";
import { A6_SHEET, cornerMaxMm, fontMaxMm, type Sheet } from "@/lib/studio/formats";
import {
  MAX_ALT,
  MAX_ELEMENTS,
  MAX_PARKED,
  MAX_QR_VALUE,
  MAX_TEXT,
  RECT_MIN_MM,
  studioFontList,
  type DesignDocumentV8,
  type ElementBox,
  type ElementPatch,
  type ImageElement,
  type QrElement,
  type RectElement,
  type StudioElement,
  type StudioFont,
  type TextAlign,
  type TextElement,
} from "@/lib/studio/types";

const FONTS = new Set<StudioFont>(studioFontList.map((font) => font.id));
const ALIGNS = new Set<TextAlign>(["left", "center", "right"]);

export function elementBox(element: StudioElement): ElementBox {
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation,
  };
}

export function elementLabel(element: StudioElement): string {
  if (element.type === "qr") return "Código QR";
  if (element.type === "rect") return "Rectángulo";
  if (element.type === "image") return element.alt || "Imagen";
  const text = element.text.trim();
  return text ? text.slice(0, 28) : "Texto";
}

export function withGeometry(element: StudioElement, box: ElementBox, sheet: Sheet = A6_SHEET): StudioElement {
  return normalizeElement({ ...element, ...box }, sheet);
}

export function replaceElement(document: DesignDocumentV8, element: StudioElement): DesignDocumentV8 {
  if (!document.elements.some((item) => item.id === element.id)) return document;
  return {
    ...document,
    elements: document.elements.map((item) => (item.id === element.id ? element : item)),
  };
}

export function updateElement(
  document: DesignDocumentV8,
  id: string,
  patch: ElementPatch,
): DesignDocumentV8 {
  const current = document.elements.find((item) => item.id === id);
  if (!current) return document;
  const next = applyPatch(current, patch, document.format);
  if (!next) return document;
  return replaceElement(document, next);
}

export function setBackground(document: DesignDocumentV8, color: string): DesignDocumentV8 {
  if (!isHexColor(color)) return document;
  return { ...document, background: color.toLowerCase() };
}

export function addText(document: DesignDocumentV8, id: string): DesignDocumentV8 {
  if (!canAdd(document, id)) return document;
  const place = sheetScale(document.format);
  const element: TextElement = normalizeElement(
    {
      id,
      role: null,
      type: "text",
      x: 12 * place.x,
      y: 86 * place.y,
      width: 80 * place.x,
      height: Math.max(14 * place.size, 6),
      rotation: 0,
      text: "Nuevo texto",
      font: "sora",
      fontSize: Math.max(6 * place.size, 2.6),
      fill: isDarkColor(document.background) ? "#f4f0e6" : "#14221f",
      align: "left",
    },
    document.format,
  );
  return insertBelowQr(document, element);
}

export function addRect(document: DesignDocumentV8, id: string): DesignDocumentV8 {
  if (!canAdd(document, id)) return document;
  const place = sheetScale(document.format);
  const element: RectElement = normalizeElement(
    {
      id,
      role: null,
      type: "rect",
      x: 16 * place.x,
      y: 78 * place.y,
      width: 40 * place.size,
      height: 16 * place.size,
      rotation: 0,
      fill: "#0f6e62",
      cornerRadius: 2 * place.size,
    },
    document.format,
  );
  return insertBelowQr(document, element);
}

export function addImage(
  document: DesignDocumentV8,
  id: string,
  src: string,
  alt: string,
  pixelWidth: number,
  pixelHeight: number,
): DesignDocumentV8 | null {
  if (!canAdd(document, id) || imageSrcIssue(src)) return null;
  if (!Number.isFinite(pixelWidth) || !Number.isFinite(pixelHeight) || pixelWidth <= 0 || pixelHeight <= 0) {
    return null;
  }
  const aspect = pixelWidth / pixelHeight;
  const place = sheetScale(document.format);
  const maxSide = 36 * place.size;
  const width = aspect >= 1 ? maxSide : maxSide * aspect;
  const height = aspect >= 1 ? maxSide / aspect : maxSide;
  const element: ImageElement = normalizeElement(
    {
      id,
      role: null,
      type: "image",
      x: 16 * place.x,
      y: 48 * place.y,
      width,
      height,
      rotation: 0,
      src,
      alt,
    },
    document.format,
  );
  return insertBelowQr(document, element);
}

export function replaceImage(
  document: DesignDocumentV8,
  id: string,
  src: string,
  alt: string,
): DesignDocumentV8 | null {
  const current = document.elements.find((item) => item.id === id);
  if (!current || current.type !== "image" || imageSrcIssue(src)) return null;
  return replaceElement(document, normalizeElement({ ...current, src, alt }, document.format));
}

export function removeElement(document: DesignDocumentV8, id: string): DesignDocumentV8 {
  const current = document.elements.find((item) => item.id === id);
  if (!current || current.type === "qr") return document;
  return { ...document, elements: document.elements.filter((item) => item.id !== id) };
}

export function duplicateElement(document: DesignDocumentV8, id: string, newId: string): DesignDocumentV8 {
  const current = document.elements.find((item) => item.id === id);
  if (!current || current.type === "qr" || !canAdd(document, newId)) return document;
  const copy = normalizeElement(
    {
      ...current,
      id: newId,
      role: null,
      x: current.x + 4,
      y: current.y + 4,
    },
    document.format,
  );
  return insertBelowQr(document, copy);
}

export function moveLayer(document: DesignDocumentV8, id: string, direction: "up" | "down"): DesignDocumentV8 {
  const index = document.elements.findIndex((item) => item.id === id);
  const nextIndex = direction === "up" ? index + 1 : index - 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= document.elements.length) return document;
  const elements = document.elements.slice();
  const [item] = elements.splice(index, 1);
  elements.splice(nextIndex, 0, item!);
  return { ...document, elements };
}

export function ensureQrOnTop(document: DesignDocumentV8): DesignDocumentV8 {
  const qrIndex = document.elements.findIndex((item) => item.type === "qr");
  if (qrIndex < 0 || qrIndex === document.elements.length - 1) return document;
  const elements = document.elements.slice();
  const [qr] = elements.splice(qrIndex, 1);
  elements.push(qr!);
  return { ...document, elements };
}

/** New content starts under the QR so it does not cover the code by default. */
export function insertBelowQr(document: DesignDocumentV8, element: StudioElement): DesignDocumentV8 {
  const qrIndex = document.elements.findIndex((item) => item.type === "qr");
  if (qrIndex < 0) return { ...document, elements: [...document.elements, element] };
  const elements = document.elements.slice();
  elements.splice(qrIndex, 0, element);
  return { ...document, elements };
}

export function restoreParked(document: DesignDocumentV8, id: string): DesignDocumentV8 {
  const parked = document.parked.find((item) => item.id === id);
  if (!parked || parked.type === "qr" || document.elements.length >= MAX_ELEMENTS) return document;
  const without = { ...document, parked: document.parked.filter((item) => item.id !== id) };
  return insertBelowQr(without, normalizeElement(parked, document.format));
}

export function restoreAllParked(document: DesignDocumentV8): DesignDocumentV8 {
  return document.parked.reduce((current, item) => restoreParked(current, item.id), document);
}

export function discardParked(document: DesignDocumentV8, id: string): DesignDocumentV8 {
  const parked = document.parked.find((item) => item.id === id);
  if (!parked || parked.type === "qr") return document;
  return { ...document, parked: document.parked.filter((item) => item.id !== id) };
}

export function normalizeElement<T extends StudioElement>(element: T, sheet: Sheet = A6_SHEET): T {
  if (element.type === "text") {
    const text = normalizeText(element, sheet);
    return clampBox(text, sheet) as T;
  }
  if (element.type === "rect") {
    const rect = normalizeRect(element, sheet);
    return clampBox(rect, sheet) as T;
  }
  if (element.type === "image") {
    const image = normalizeImage(element);
    return clampBox(image, sheet) as T;
  }
  return clampQrGeometry(normalizeQr(element), sheet) as T;
}

/** How the A6 defaults for new elements translate to another sheet. */
function sheetScale(sheet: Sheet): { x: number; y: number; size: number } {
  const x = sheet.widthMm / A6_SHEET.widthMm;
  const y = sheet.heightMm / A6_SHEET.heightMm;
  return { x, y, size: Math.min(x, y) };
}

function applyPatch(element: StudioElement, patch: ElementPatch, sheet: Sheet): StudioElement | null {
  if (element.type === "qr") {
    const foreground = patch.foreground ?? element.foreground;
    const background = patch.background ?? element.background;
    if ((patch.foreground !== undefined || patch.background !== undefined) && qrContrastIssue(foreground, background)) {
      return null;
    }
  }
  if (patch.fill !== undefined && !isHexColor(patch.fill)) return null;
  if (patch.src !== undefined && imageSrcIssue(patch.src)) return null;
  if (patch.font !== undefined && !FONTS.has(patch.font)) return null;
  if (patch.align !== undefined && !ALIGNS.has(patch.align)) return null;

  const next = { ...element } as StudioElement;
  assignBox(next, patch);
  if (next.type === "qr") {
    // The QR is always square: the dimension being edited drives the other one, so shrinking
    // only the width is not undone by the larger, untouched height.
    if (patch.width !== undefined) next.height = patch.width;
    else if (patch.height !== undefined) next.width = patch.height;
  }
  if (next.type === "text") {
    if (patch.text !== undefined) next.text = patch.text;
    if (patch.font !== undefined) next.font = patch.font;
    if (patch.fontSize !== undefined) next.fontSize = patch.fontSize;
    if (patch.fill !== undefined) next.fill = patch.fill;
    if (patch.align !== undefined) next.align = patch.align;
  } else if (next.type === "rect") {
    if (patch.fill !== undefined) next.fill = patch.fill;
    if (patch.cornerRadius !== undefined) next.cornerRadius = patch.cornerRadius;
  } else if (next.type === "image") {
    if (patch.alt !== undefined) next.alt = patch.alt;
    if (patch.src !== undefined) next.src = patch.src;
  } else {
    if (patch.value !== undefined) next.value = patch.value;
    if (patch.foreground !== undefined) next.foreground = patch.foreground;
    if (patch.background !== undefined) next.background = patch.background;
  }
  return normalizeElement(next, sheet);
}

function assignBox(element: StudioElement, patch: ElementPatch) {
  if (patch.x !== undefined) element.x = patch.x;
  if (patch.y !== undefined) element.y = patch.y;
  if (patch.width !== undefined) element.width = patch.width;
  if (patch.height !== undefined) element.height = patch.height;
  if (patch.rotation !== undefined) element.rotation = patch.rotation;
}

function normalizeText(element: TextElement, sheet: Sheet): TextElement {
  return {
    ...element,
    text: element.text.slice(0, MAX_TEXT),
    font: FONTS.has(element.font) ? element.font : "source",
    fontSize: mm(clamp(element.fontSize, 2, fontMaxMm(sheet))),
    fill: isHexColor(element.fill) ? element.fill.toLowerCase() : "#14221f",
    align: ALIGNS.has(element.align) ? element.align : "left",
  };
}

function normalizeRect(element: RectElement, sheet: Sheet): RectElement {
  return {
    ...element,
    fill: isHexColor(element.fill) ? element.fill.toLowerCase() : "#0f6e62",
    cornerRadius: mm(clamp(element.cornerRadius, 0, cornerMaxMm(sheet))),
  };
}

function normalizeImage(element: ImageElement): ImageElement {
  return {
    ...element,
    alt: cleanAlt(element.alt),
  };
}

function normalizeQr(element: QrElement): QrElement {
  return {
    ...element,
    value: element.value.slice(0, MAX_QR_VALUE),
    foreground: element.foreground.toLowerCase(),
    background: element.background.toLowerCase(),
  };
}

function clampBox<T extends TextElement | RectElement | ImageElement>(element: T, sheet: Sheet): T {
  // Thin rules and stripes are legitimate rectangles on small sheets.
  const minWidth = element.type === "text" ? 8 : element.type === "rect" ? RECT_MIN_MM : 4;
  const minHeight = element.type === "rect" ? RECT_MIN_MM : 4;
  const width = mm(clamp(finite(element.width, minWidth), minWidth, sheet.widthMm));
  const height = mm(clamp(finite(element.height, minHeight), minHeight, sheet.heightMm));
  return {
    ...element,
    width,
    height,
    x: mm(clamp(finite(element.x, 0), Math.min(0, -width + 4), sheet.widthMm - Math.min(4, width))),
    y: mm(clamp(finite(element.y, 0), Math.min(0, -height + 4), sheet.heightMm - Math.min(4, height))),
    rotation: normalizeRotation(element.rotation),
  };
}

function cleanAlt(alt: string): string {
  const cleaned = alt.replace(/\s+/g, " ").trim().slice(0, MAX_ALT);
  return cleaned || "Imagen";
}

function canAdd(document: DesignDocumentV8, id: string): boolean {
  return document.elements.length < MAX_ELEMENTS && document.parked.length <= MAX_PARKED && !hasId(document, id);
}

function hasId(document: DesignDocumentV8, id: string): boolean {
  return document.elements.some((item) => item.id === id) || document.parked.some((item) => item.id === id);
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
