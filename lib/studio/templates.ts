import { isHexColor } from "@/lib/color";
import { createId, type IdFactory } from "@/lib/studio/ids";
import { clampQrGeometry } from "@/lib/studio/qr-rules";
import {
  A6_HEIGHT_MM,
  A6_WIDTH_MM,
  QR_INK,
  QR_PAPER,
  STUDIO_VERSION,
  type DesignDocumentV8,
  type QrElement,
  type RectElement,
  type StudioElement,
  type StudioFont,
  type TemplateId,
  type TemplateLayoutSnapshot,
  type TextAlign,
  type TextElement,
} from "@/lib/studio/types";

type FrameBase = {
  role: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

type TextFrame = FrameBase & {
  type: "text";
  text: string;
  font: StudioFont;
  fontSize: number;
  fill: string;
  align: TextAlign;
};

type RectFrame = FrameBase & {
  type: "rect";
  fill: string;
  cornerRadius: number;
};

type QrFrame = FrameBase & {
  type: "qr";
  value: string;
  foreground: string;
  background: string;
};

type Frame = TextFrame | RectFrame | QrFrame;

export const templateList: { id: TemplateId; name: string; description: string }[] = [
  {
    id: "corporativo",
    name: "Corporativo",
    description: "Franja institucional, datos en orden y el código al pie.",
  },
  {
    id: "creativo",
    name: "Creativo",
    description: "Color pleno y el código como protagonista.",
  },
];

/** Suggested palette for each template. Applied only when the user asks. */
export const templatePalettes: Record<
  TemplateId,
  { background: string; fills: Record<string, string> }
> = {
  corporativo: {
    background: "#f4f0e6",
    fills: {
      banda: "#14352f",
      rubro: "#d7efe8",
      titulo: "#14221f",
      bajada: "#3d4a45",
      ayuda: "#3d4a45",
      acento: "#0f6e62",
    },
  },
  creativo: {
    background: "#0b5348",
    fills: {
      mancha: "#ff4d00",
      titulo: "#1c1915",
      bajada: "#e7f3ef",
      ayuda: "#d7efe8",
      acento: "#94d2bd",
    },
  },
};

const corporativo: Frame[] = [
  { type: "rect", role: "banda", x: 0, y: 0, width: 105, height: 28, rotation: 0, fill: "#14352f", cornerRadius: 0 },
  {
    type: "text",
    role: "rubro",
    x: 10,
    y: 8,
    width: 70,
    height: 12,
    rotation: 0,
    text: "Tu negocio",
    font: "source",
    fontSize: 3.6,
    fill: "#d7efe8",
    align: "left",
  },
  {
    type: "text",
    role: "titulo",
    x: 10,
    y: 38,
    width: 85,
    height: 22,
    rotation: 0,
    text: "Dejá tu reseña",
    font: "sora",
    fontSize: 9,
    fill: "#14221f",
    align: "left",
  },
  {
    type: "text",
    role: "bajada",
    x: 10,
    y: 62,
    width: 85,
    height: 16,
    rotation: 0,
    text: "Contá en una frase para qué sirve el código.",
    font: "source",
    fontSize: 4,
    fill: "#3d4a45",
    align: "left",
  },
  { type: "rect", role: "acento", x: 10, y: 82, width: 28, height: 4, rotation: 0, fill: "#0f6e62", cornerRadius: 1 },
  {
    type: "text",
    role: "ayuda",
    x: 10,
    y: 118,
    width: 48,
    height: 16,
    rotation: 0,
    text: "Escaneá el código",
    font: "source",
    fontSize: 3.5,
    fill: "#3d4a45",
    align: "left",
  },
  {
    type: "qr",
    role: "qr",
    x: 64,
    y: 100,
    width: 32,
    height: 32,
    rotation: 0,
    value: "",
    foreground: QR_INK,
    background: QR_PAPER,
  },
];

const creativo: Frame[] = [
  { type: "rect", role: "mancha", x: 8, y: 10, width: 89, height: 48, rotation: 0, fill: "#ff4d00", cornerRadius: 5 },
  {
    type: "text",
    role: "titulo",
    x: 14,
    y: 20,
    width: 77,
    height: 28,
    rotation: 0,
    text: "Que se vea de lejos",
    font: "sora",
    fontSize: 9,
    fill: "#1c1915",
    align: "left",
  },
  {
    type: "text",
    role: "bajada",
    x: 10,
    y: 68,
    width: 85,
    height: 14,
    rotation: 0,
    text: "Un mensaje corto y un código fácil de encontrar.",
    font: "source",
    fontSize: 4.2,
    fill: "#e7f3ef",
    align: "left",
  },
  {
    type: "text",
    role: "ayuda",
    x: 10,
    y: 84,
    width: 85,
    height: 10,
    rotation: 0,
    text: "tu-sitio.example",
    font: "source",
    fontSize: 3.5,
    fill: "#d7efe8",
    align: "left",
  },
  {
    type: "qr",
    role: "qr",
    x: 27.5,
    y: 96,
    width: 50,
    height: 50,
    rotation: 0,
    value: "",
    foreground: QR_INK,
    background: QR_PAPER,
  },
];

const templates: Record<TemplateId, { background: string; frames: Frame[] }> = {
  corporativo: { background: templatePalettes.corporativo.background, frames: corporativo },
  creativo: { background: templatePalettes.creativo.background, frames: creativo },
};

export function createDocument(templateId: TemplateId, idFor: IdFactory = createId): DesignDocumentV8 {
  return applyTemplate(emptyDocument(templateId), templateId, { idFor, applyPalette: true });
}

export type ApplyTemplateOptions = {
  idFor?: IdFactory;
  /** When true, also paints the suggested background and role colors. */
  applyPalette?: boolean;
};

/**
 * Switches composition while keeping user content.
 * Saves the current arrangement into layouts[current] and restores layouts[next] when present.
 * Background is preserved unless applyPalette is set.
 */
export function applyTemplate(
  document: DesignDocumentV8,
  templateId: TemplateId,
  options: ApplyTemplateOptions | IdFactory = {},
): DesignDocumentV8 {
  const opts: ApplyTemplateOptions =
    typeof options === "function" ? { idFor: options } : options;
  const idFor = opts.idFor ?? createId;
  const applyPalette = opts.applyPalette === true;

  const layouts = { ...(document.layouts ?? {}) };
  if (document.elements.length > 0 || document.parked.length > 0) {
    layouts[document.templateId] = {
      elements: document.elements.map(cloneElement),
      parked: document.parked.map(cloneElement),
    };
  }

  const pool = uniquePool([...document.elements, ...document.parked]);
  const saved = layouts[templateId];
  let next: DesignDocumentV8;

  if (saved) {
    next = restoreSavedLayout(document, templateId, saved, pool, layouts);
  } else {
    next = buildFromFrames(document, templateId, pool, layouts, idFor);
  }

  if (applyPalette) {
    next = applySuggestedColors(next);
  }
  return next;
}

export function applySuggestedColors(document: DesignDocumentV8): DesignDocumentV8 {
  const palette = templatePalettes[document.templateId];
  const paint = (element: StudioElement): StudioElement => {
    if (!element.role) return element;
    const fill = palette.fills[element.role];
    if (!fill || !isHexColor(fill)) return element;
    if (element.type === "text") return { ...element, fill };
    if (element.type === "rect") return { ...element, fill };
    return element;
  };
  return {
    ...document,
    background: palette.background,
    elements: document.elements.map(paint),
    parked: document.parked.map(paint),
  };
}

function restoreSavedLayout(
  document: DesignDocumentV8,
  templateId: TemplateId,
  saved: TemplateLayoutSnapshot,
  pool: StudioElement[],
  layouts: DesignDocumentV8["layouts"],
): DesignDocumentV8 {
  const byId = new Map(pool.map((item) => [item.id, item]));
  const used = new Set<string>();
  const elements: StudioElement[] = [];

  for (const snapshot of saved.elements) {
    const live = byId.get(snapshot.id) ?? snapshot;
    used.add(snapshot.id);
    elements.push(mergeContent(snapshot, live));
  }

  const parked: StudioElement[] = [];
  for (const snapshot of saved.parked) {
    if (used.has(snapshot.id) || snapshot.type === "qr") continue;
    const live = byId.get(snapshot.id) ?? snapshot;
    used.add(snapshot.id);
    parked.push(mergeContent(snapshot, live));
  }

  for (const item of pool) {
    if (used.has(item.id) || item.type === "qr") continue;
    parked.push(cloneElement(item));
  }

  const withQr = ensureSingleQr(elements, pool);
  return {
    version: STUDIO_VERSION,
    format: { id: "a6", widthMm: A6_WIDTH_MM, heightMm: A6_HEIGHT_MM },
    background: document.background,
    templateId,
    layouts,
    elements: withQr,
    parked: parked.slice(0, 40),
  };
}

function buildFromFrames(
  document: DesignDocumentV8,
  templateId: TemplateId,
  pool: StudioElement[],
  layouts: DesignDocumentV8["layouts"],
  idFor: IdFactory,
): DesignDocumentV8 {
  const template = templates[templateId];
  const used = new Set<string>();
  const elements: StudioElement[] = [];

  for (const frame of template.frames) {
    const match = pool.find((item) => !used.has(item.id) && item.role === frame.role && item.type === frame.type);
    if (match) {
      used.add(match.id);
      elements.push(placeFrameKeepStyle(match, frame));
    } else {
      const contentMatch =
        frame.type === "text"
          ? pool.find((item) => !used.has(item.id) && item.type === "text" && item.role === frame.role)
          : undefined;
      if (contentMatch) {
        used.add(contentMatch.id);
        elements.push(placeFrameKeepStyle(contentMatch, frame));
      } else {
        elements.push(createFromFrame(frame, idFor(frame.role)));
      }
    }
  }

  const parked = pool.filter((item) => !used.has(item.id) && item.type !== "qr").slice(0, 40);
  return {
    version: STUDIO_VERSION,
    format: { id: "a6", widthMm: A6_WIDTH_MM, heightMm: A6_HEIGHT_MM },
    background: document.background,
    templateId,
    layouts,
    elements,
    parked,
  };
}

function emptyDocument(templateId: TemplateId): DesignDocumentV8 {
  return {
    version: STUDIO_VERSION,
    format: { id: "a6", widthMm: A6_WIDTH_MM, heightMm: A6_HEIGHT_MM },
    background: templates[templateId].background,
    templateId,
    layouts: {},
    elements: [],
    parked: [],
  };
}

/** Keep user colors/fonts when placing into a new frame; only take geometry from the frame. */
function placeFrameKeepStyle(element: StudioElement, frame: Frame): StudioElement {
  const box = {
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    rotation: frame.rotation,
  };
  if (element.type === "text" && frame.type === "text") {
    const text: TextElement = {
      ...element,
      ...box,
      role: frame.role,
    };
    return text;
  }
  if (element.type === "rect" && frame.type === "rect") {
    const rect: RectElement = { ...element, ...box, role: frame.role };
    return rect;
  }
  if (element.type === "qr" && frame.type === "qr") {
    return clampQrGeometry({ ...element, ...box, role: frame.role });
  }
  return element;
}

function createFromFrame(frame: Frame, id: string): StudioElement {
  const base = {
    id,
    role: frame.role,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    rotation: frame.rotation,
  };
  if (frame.type === "text") {
    const text: TextElement = {
      ...base,
      type: "text",
      text: frame.text,
      font: frame.font,
      fontSize: frame.fontSize,
      fill: frame.fill,
      align: frame.align,
    };
    return text;
  }
  if (frame.type === "rect") {
    const rect: RectElement = { ...base, type: "rect", fill: frame.fill, cornerRadius: frame.cornerRadius };
    return rect;
  }
  return clampQrGeometry({
    ...base,
    type: "qr",
    value: frame.value,
    foreground: frame.foreground,
    background: frame.background,
  });
}

function mergeContent(snapshot: StudioElement, live: StudioElement): StudioElement {
  if (snapshot.type === "text" && live.type === "text") {
    return { ...snapshot, text: live.text };
  }
  if (snapshot.type === "image" && live.type === "image") {
    return { ...snapshot, src: live.src, alt: live.alt };
  }
  if (snapshot.type === "qr" && live.type === "qr") {
    return clampQrGeometry({
      ...snapshot,
      value: live.value,
      foreground: live.foreground,
      background: live.background,
    });
  }
  if (snapshot.type === "rect" && live.type === "rect") {
    return snapshot;
  }
  return snapshot;
}

function ensureSingleQr(elements: StudioElement[], pool: StudioElement[]): StudioElement[] {
  const existing = elements.find((item) => item.type === "qr");
  if (existing) return elements.map((item) => (item.type === "qr" ? clampQrGeometry(item) : item));
  const fromPool = pool.find((item): item is QrElement => item.type === "qr");
  if (fromPool) return [...elements, clampQrGeometry(fromPool)];
  return elements;
}

function uniquePool(items: StudioElement[]): StudioElement[] {
  const seen = new Set<string>();
  const pool: StudioElement[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    pool.push(item);
  }
  return pool;
}

function cloneElement(element: StudioElement): StudioElement {
  return { ...element };
}
