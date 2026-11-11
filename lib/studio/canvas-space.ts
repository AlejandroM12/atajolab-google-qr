import { insertBelowQr, normalizeElement } from "@/lib/studio/document";
import { axisAlignedBounds } from "@/lib/studio/geometry";
import { qrProtectedBounds } from "@/lib/studio/validation";
import type { Sheet } from "@/lib/studio/formats";
import {
  MAX_ELEMENTS,
  type DesignDocumentV8,
  type QrElement,
  type StudioElement,
} from "@/lib/studio/types";

type Box = { x: number; y: number; width: number; height: number };

/** Below this share of its area on the sheet, an element counts as off the canvas. */
const MIN_VISIBLE_SHARE = 0.5;
const GRID_MM = 2;

/** Elements the user made or brought in, as opposed to pieces a template generated. */
export function isUserContent(element: StudioElement): boolean {
  return element.role === null || element.type === "image";
}

function visibleShare(element: StudioElement, sheet: Sheet): number {
  const box = axisAlignedBounds(element);
  const area = box.width * box.height;
  if (area <= 0) return 1;
  return intersection(box, { x: 0, y: 0, width: sheet.widthMm, height: sheet.heightMm }) / area;
}

/** On-sheet elements the user dragged (mostly) outside the printable area. */
export function offCanvasElements(document: DesignDocumentV8): StudioElement[] {
  return document.elements.filter((item) => item.type !== "qr" && visibleShare(item, document.format) < MIN_VISIBLE_SHARE);
}

/** What the "Fuera del lienzo" panel lists: parked user content plus elements off the sheet. */
export function recoverableElements(document: DesignDocumentV8): StudioElement[] {
  return [...document.parked.filter((item) => item.type !== "qr"), ...offCanvasElements(document)];
}

function intersection(a: Box, b: Box): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Deterministic spot inside the sheet: no overlap when possible, otherwise the
 * least covering one (QR and its quiet zone weigh most, then text and images).
 * Ties go to the spot closest to where the element already was.
 */
export function findPlacement(
  document: DesignDocumentV8,
  element: StudioElement,
): { x: number; y: number; clear: boolean } {
  const sheetWidth = document.format.widthMm;
  const sheetHeight = document.format.heightMm;
  const width = Math.min(element.width, sheetWidth);
  const height = Math.min(element.height, sheetHeight);
  const obstacles: { box: Box; weight: number }[] = [];
  for (const item of document.elements) {
    if (item.id === element.id) continue;
    if (item.type === "qr") obstacles.push({ box: qrProtectedBounds(item as QrElement), weight: 100 });
    else obstacles.push({ box: axisAlignedBounds(item), weight: item.type === "rect" ? 1 : 3 });
  }
  const wantX = Math.min(Math.max(element.x, 0), sheetWidth - width);
  const wantY = Math.min(Math.max(element.y, 0), sheetHeight - height);

  let best = { x: wantX, y: wantY, score: Number.POSITIVE_INFINITY, distance: Number.POSITIVE_INFINITY };
  const xs = steps(sheetWidth - width);
  const ys = steps(sheetHeight - height);
  for (const y of ys) {
    for (const x of xs) {
      const box = { x, y, width, height };
      let score = 0;
      for (const obstacle of obstacles) score += intersection(box, obstacle.box) * obstacle.weight;
      const distance = Math.hypot(x - wantX, y - wantY);
      if (score < best.score - 1e-9 || (Math.abs(score - best.score) <= 1e-9 && distance < best.distance)) {
        best = { x, y, score, distance };
      }
    }
  }
  return { x: round(best.x), y: round(best.y), clear: best.score === 0 };
}

function steps(max: number): number[] {
  if (max <= 0) return [0];
  const values: number[] = [];
  for (let value = 0; value < max; value += GRID_MM) values.push(value);
  values.push(max);
  return values;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Brings one parked or off-canvas element back onto the sheet. */
export function recoverElement(
  document: DesignDocumentV8,
  id: string,
): { document: DesignDocumentV8; clear: boolean } | null {
  const parked = document.parked.find((item) => item.id === id);
  if (parked) {
    if (parked.type === "qr" || document.elements.length >= MAX_ELEMENTS) return null;
    const without = { ...document, parked: document.parked.filter((item) => item.id !== id) };
    const element = normalizeElement(parked, document.format);
    const spot = findPlacement(without, element);
    return { document: insertBelowQr(without, normalizeElement({ ...element, ...spot }, document.format)), clear: spot.clear };
  }
  const current = document.elements.find((item) => item.id === id);
  if (!current || current.type === "qr" || visibleShare(current, document.format) >= MIN_VISIBLE_SHARE) return null;
  const spot = findPlacement(document, current);
  const moved = normalizeElement({ ...current, x: spot.x, y: spot.y }, document.format);
  return {
    document: { ...document, elements: document.elements.map((item) => (item.id === id ? moved : item)) },
    clear: spot.clear,
  };
}

/** Recovers everything listed, one by one, so later items avoid the earlier ones. */
export function recoverAll(document: DesignDocumentV8): {
  document: DesignDocumentV8;
  recovered: number;
  crowded: number;
  left: number;
} {
  let current = document;
  let recovered = 0;
  let crowded = 0;
  for (const item of recoverableElements(document)) {
    const result = recoverElement(current, item.id);
    if (!result) continue;
    current = result.document;
    recovered += 1;
    if (!result.clear) crowded += 1;
  }
  return { document: current, recovered, crowded, left: recoverableElements(current).length };
}
