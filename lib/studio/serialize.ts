import { isHexColor } from "@/lib/color";
import { normalizeElement } from "@/lib/studio/document";
import { imageSrcIssue } from "@/lib/studio/images";
import { safeQrColors } from "@/lib/studio/qr-rules";
import { readDesignFormat, type Sheet } from "@/lib/studio/formats";
import {
  MAX_ELEMENTS,
  MAX_PARKED,
  STUDIO_VERSION,
  studioFontList,
  type DesignDocumentV8,
  type ImageElement,
  type QrElement,
  type RectElement,
  type StudioElement,
  type StudioFont,
  type TemplateId,
  type TemplateLayoutSnapshot,
  type TextAlign,
  type TextElement,
} from "@/lib/studio/types";

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const ROLE = /^[a-z][a-z0-9-]{0,31}$/;
const TEMPLATES = new Set<TemplateId>([
  "clasico",
  "vivo",
  "nocturno",
  "negocio",
  "corporativo",
  "creativo",
]);
const FONTS = new Set<StudioFont>(studioFontList.map((font) => font.id));
const ALIGNS = new Set<TextAlign>(["left", "center", "right"]);

export type ParsedDesign = {
  document: DesignDocumentV8;
  droppedImages: number;
  repairedQr: boolean;
};

export function serializeDesign(document: DesignDocumentV8): string {
  return JSON.stringify(document);
}

export function parseDesign(raw: string): ParsedDesign | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  if (value.version !== STUDIO_VERSION) return null;
  const format = readDesignFormat(value.format);
  if (!format) return null;
  if (typeof value.background !== "string" || !isHexColor(value.background)) return null;
  if (typeof value.templateId !== "string" || !TEMPLATES.has(value.templateId as TemplateId)) return null;
  if (!Array.isArray(value.elements) || !Array.isArray(value.parked)) return null;
  if (value.elements.length > MAX_ELEMENTS || value.parked.length > MAX_PARKED) return null;

  const seen = new Set<string>();
  let droppedImages = 0;
  let repairedQr = false;
  const elements: StudioElement[] = [];
  for (const item of value.elements) {
    const parsed = parseElement(item, seen, format);
    if (parsed.status === "drop-image") {
      droppedImages += 1;
      continue;
    }
    if (parsed.status === "invalid") return null;
    if (parsed.element.type === "qr" && parsed.repaired) repairedQr = true;
    elements.push(parsed.element);
  }

  const parked: StudioElement[] = [];
  for (const item of value.parked) {
    const parsed = parseElement(item, seen, format);
    if (parsed.status === "drop-image") {
      droppedImages += 1;
      continue;
    }
    if (parsed.status === "invalid" || parsed.element.type === "qr") return null;
    parked.push(parsed.element);
  }

  if (elements.filter((item) => item.type === "qr").length !== 1) return null;

  const layouts = parseLayouts(value.layouts, format);
  if (layouts === null) return null;

  return {
    document: {
      version: STUDIO_VERSION,
      format,
      background: value.background.toLowerCase(),
      templateId: value.templateId as TemplateId,
      layouts,
      elements,
      parked,
    },
    droppedImages,
    repairedQr,
  };
}

function parseLayouts(value: unknown, sheet: Sheet): DesignDocumentV8["layouts"] | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  const layouts: DesignDocumentV8["layouts"] = {};
  for (const key of Object.keys(value)) {
    if (!TEMPLATES.has(key as TemplateId)) return null;
    const entry = value[key];
    if (!isRecord(entry) || !Array.isArray(entry.elements) || !Array.isArray(entry.parked)) return null;
    if (entry.elements.length > MAX_ELEMENTS || entry.parked.length > MAX_PARKED) return null;
    const localSeen = new Set<string>();
    const elements: StudioElement[] = [];
    for (const item of entry.elements) {
      const parsed = parseElement(item, localSeen, sheet);
      if (parsed.status === "drop-image") continue;
      if (parsed.status === "invalid") return null;
      elements.push(parsed.element);
    }
    const parked: StudioElement[] = [];
    for (const item of entry.parked) {
      const parsed = parseElement(item, localSeen, sheet);
      if (parsed.status === "drop-image") continue;
      if (parsed.status === "invalid" || parsed.element.type === "qr") return null;
      parked.push(parsed.element);
    }
    const snapshot: TemplateLayoutSnapshot = { elements, parked };
    layouts[key as TemplateId] = snapshot;
  }
  return layouts;
}

type ParseResult =
  | { status: "ok"; element: StudioElement; repaired: boolean }
  | { status: "drop-image" }
  | { status: "invalid" };

function parseElement(value: unknown, seen: Set<string>, sheet: Sheet): ParseResult {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.id !== "string" || !ID.test(value.id)) {
    return { status: "invalid" };
  }
  if (seen.has(value.id)) return { status: "invalid" };
  const role = value.role === null ? null : typeof value.role === "string" && ROLE.test(value.role) ? value.role : undefined;
  if (role === undefined) return { status: "invalid" };
  const box = readBox(value);
  if (!box) return { status: "invalid" };

  if (value.type === "image") {
    if (typeof value.src !== "string" || typeof value.alt !== "string") return { status: "invalid" };
    if (imageSrcIssue(value.src)) return { status: "drop-image" };
    const image: ImageElement = normalizeElement(
      { ...box, id: value.id, role, type: "image", src: value.src, alt: value.alt },
      sheet,
    );
    seen.add(value.id);
    return { status: "ok", element: image, repaired: false };
  }

  if (value.type === "text") {
    if (typeof value.text !== "string" || typeof value.font !== "string" || typeof value.fill !== "string") {
      return { status: "invalid" };
    }
    if (typeof value.fontSize !== "number" || typeof value.align !== "string") return { status: "invalid" };
    if (!FONTS.has(value.font as StudioFont) || !ALIGNS.has(value.align as TextAlign) || !isHexColor(value.fill)) {
      return { status: "invalid" };
    }
    const text: TextElement = normalizeElement({
      ...box,
      id: value.id,
      role,
      type: "text",
      text: value.text,
      font: value.font as StudioFont,
      fontSize: value.fontSize,
      fill: value.fill,
      align: value.align as TextAlign,
    }, sheet);
    seen.add(value.id);
    return { status: "ok", element: text, repaired: false };
  }

  if (value.type === "rect") {
    if (typeof value.fill !== "string" || !isHexColor(value.fill) || typeof value.cornerRadius !== "number") {
      return { status: "invalid" };
    }
    const rect: RectElement = normalizeElement({
      ...box,
      id: value.id,
      role,
      type: "rect",
      fill: value.fill,
      cornerRadius: value.cornerRadius,
    }, sheet);
    seen.add(value.id);
    return { status: "ok", element: rect, repaired: false };
  }

  if (value.type === "qr") {
    if (typeof value.value !== "string" || typeof value.foreground !== "string" || typeof value.background !== "string") {
      return { status: "invalid" };
    }
    const colors = safeQrColors(value.foreground, value.background);
    const qr: QrElement = normalizeElement({
      ...box,
      id: value.id,
      role,
      type: "qr",
      value: value.value,
      foreground: colors.foreground,
      background: colors.background,
    }, sheet);
    seen.add(value.id);
    return { status: "ok", element: qr, repaired: colors.repaired };
  }

  return { status: "invalid" };
}

function readBox(value: Record<string, unknown>): { x: number; y: number; width: number; height: number; rotation: number } | null {
  if (
    typeof value.x !== "number" ||
    typeof value.y !== "number" ||
    typeof value.width !== "number" ||
    typeof value.height !== "number" ||
    typeof value.rotation !== "number"
  ) {
    return null;
  }
  if (![value.x, value.y, value.width, value.height, value.rotation].every(Number.isFinite)) return null;
  return { x: value.x, y: value.y, width: value.width, height: value.height, rotation: value.rotation };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
