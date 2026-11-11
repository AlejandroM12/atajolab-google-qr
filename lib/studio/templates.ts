import { isHexColor } from "@/lib/color";
import { isUserContent } from "@/lib/studio/canvas-space";
import { normalizeElement } from "@/lib/studio/document";
import {
  A6_SHEET,
  DEFAULT_FORMAT_ID,
  designFormat,
  formatShape,
  qrMaxMm,
  type DesignFormat,
  type FormatId,
  type Sheet,
} from "@/lib/studio/formats";
import { clamp, mm } from "@/lib/studio/geometry";
import { createId, type IdFactory } from "@/lib/studio/ids";
import { clampQrGeometry } from "@/lib/studio/qr-rules";
import { estimateFittingSize } from "@/lib/studio/text-estimate";
import {
  MAX_ELEMENTS,
  MAX_PARKED,
  QR_INK,
  QR_MIN_MM,
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

/** Suggested starting designs shown first on /crear and the landing. */
export const suggestedTemplateIds: TemplateId[] = ["clasico", "vivo", "nocturno", "negocio"];

export const templateList: { id: TemplateId; name: string; description: string }[] = [
  {
    id: "clasico",
    name: "Clásico",
    description: "Papel claro y un marco alrededor del código.",
  },
  {
    id: "vivo",
    name: "Vivo",
    description: "Riel verde y franja naranja.",
  },
  {
    id: "nocturno",
    name: "Nocturno",
    description: "Fondo oscuro y el código sobre una placa clara.",
  },
  {
    id: "negocio",
    name: "Mi negocio",
    description: "El nombre grande y una franja de color.",
  },
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

export const suggestedTemplates = templateList.filter((template) =>
  suggestedTemplateIds.includes(template.id),
);

/** Suggested palette for each template. Applied only when the user asks. */
export const templatePalettes: Record<
  TemplateId,
  { background: string; fills: Record<string, string> }
> = {
  clasico: {
    background: "#fffcf8",
    fills: {
      rubro: "#1c1915",
      titulo: "#1c1915",
      ayuda: "#1c1915",
      marco: "#1c1915",
      acento: "#a16207",
    },
  },
  vivo: {
    background: "#f3ecdf",
    fills: {
      riel: "#0c3b32",
      banda: "#ff4d00",
      titulo: "#ffffff",
      placa: "#ffffff",
      ayuda: "#1c1915",
    },
  },
  nocturno: {
    background: "#121417",
    fills: {
      franja: "#ffb000",
      rubro: "#f7f4ee",
      titulo: "#f7f4ee",
      placa: "#ffffff",
      ayuda: "#f7f4ee",
    },
  },
  negocio: {
    background: "#f7f1e8",
    fills: {
      rubro: "#1c1915",
      banda: "#1c1915",
      titulo: "#ffffff",
      ayuda: "#ffffff",
    },
  },
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

const clasico: Frame[] = [
  {
    type: "text",
    role: "rubro",
    x: 10,
    y: 10,
    width: 85,
    height: 10,
    rotation: 0,
    text: "Tu negocio",
    font: "fraunces",
    fontSize: 5,
    fill: "#1c1915",
    align: "center",
  },
  {
    type: "text",
    role: "titulo",
    x: 10,
    y: 24,
    width: 85,
    height: 18,
    rotation: 0,
    text: "Tu opinión nos importa",
    font: "fraunces",
    fontSize: 7,
    fill: "#1c1915",
    align: "center",
  },
  { type: "rect", role: "acento", x: 36, y: 44, width: 33, height: 3, rotation: 0, fill: "#a16207", cornerRadius: 1 },
  { type: "rect", role: "marco", x: 22, y: 52, width: 61, height: 61, rotation: 0, fill: "#ffffff", cornerRadius: 0 },
  {
    type: "qr",
    role: "qr",
    x: 26.5,
    y: 56.5,
    width: 52,
    height: 52,
    rotation: 0,
    value: "",
    foreground: QR_INK,
    background: QR_PAPER,
  },
  {
    type: "text",
    role: "ayuda",
    x: 10,
    y: 120,
    width: 85,
    height: 16,
    rotation: 0,
    text: "Escaneá y dejanos tu reseña en Google",
    font: "source",
    fontSize: 4,
    fill: "#1c1915",
    align: "center",
  },
];

const vivo: Frame[] = [
  { type: "rect", role: "riel", x: 0, y: 0, width: 17, height: 148, rotation: 0, fill: "#0c3b32", cornerRadius: 0 },
  { type: "rect", role: "banda", x: 17, y: 0, width: 88, height: 48, rotation: 0, fill: "#ff4d00", cornerRadius: 0 },
  {
    type: "text",
    role: "titulo",
    x: 22,
    y: 12,
    width: 76,
    height: 28,
    rotation: 0,
    text: "Dejanos tu reseña",
    font: "sora",
    fontSize: 8,
    fill: "#ffffff",
    align: "left",
  },
  { type: "rect", role: "placa", x: 12, y: 54, width: 86, height: 58, rotation: 0, fill: "#ffffff", cornerRadius: 2 },
  {
    type: "qr",
    role: "qr",
    x: 28,
    y: 58,
    width: 48,
    height: 48,
    rotation: 0,
    value: "",
    foreground: QR_INK,
    background: QR_PAPER,
  },
  {
    type: "text",
    role: "ayuda",
    x: 22,
    y: 120,
    width: 76,
    height: 16,
    rotation: 0,
    text: "Escaneá acá, en Google",
    font: "source",
    fontSize: 4.2,
    fill: "#1c1915",
    align: "left",
  },
];

const nocturno: Frame[] = [
  { type: "rect", role: "franja", x: 0, y: 0, width: 105, height: 5, rotation: 0, fill: "#ffb000", cornerRadius: 0 },
  {
    type: "text",
    role: "rubro",
    x: 10,
    y: 14,
    width: 85,
    height: 10,
    rotation: 0,
    text: "Tu negocio",
    font: "source",
    fontSize: 4,
    fill: "#f7f4ee",
    align: "left",
  },
  {
    type: "text",
    role: "titulo",
    x: 10,
    y: 28,
    width: 85,
    height: 22,
    rotation: 0,
    text: "Tu experiencia cuenta",
    font: "sora",
    fontSize: 8,
    fill: "#f7f4ee",
    align: "left",
  },
  { type: "rect", role: "placa", x: 22, y: 58, width: 61, height: 61, rotation: 0, fill: "#ffffff", cornerRadius: 2 },
  {
    type: "qr",
    role: "qr",
    x: 26.5,
    y: 62.5,
    width: 52,
    height: 52,
    rotation: 0,
    value: "",
    foreground: "#121417",
    background: QR_PAPER,
  },
  {
    type: "text",
    role: "ayuda",
    x: 10,
    y: 126,
    width: 85,
    height: 14,
    rotation: 0,
    text: "Escaneá acá, en Google",
    font: "source",
    fontSize: 4.2,
    fill: "#f7f4ee",
    align: "center",
  },
];

const negocio: Frame[] = [
  {
    type: "text",
    role: "rubro",
    x: 10,
    y: 10,
    width: 85,
    height: 16,
    rotation: 0,
    text: "Tu negocio",
    font: "sora",
    fontSize: 9,
    fill: "#1c1915",
    align: "left",
  },
  { type: "rect", role: "banda", x: 0, y: 32, width: 105, height: 28, rotation: 0, fill: "#1c1915", cornerRadius: 0 },
  {
    type: "text",
    role: "titulo",
    x: 8,
    y: 36,
    width: 89,
    height: 12,
    rotation: 0,
    text: "Tu opinión nos importa",
    font: "sora",
    fontSize: 5.5,
    fill: "#ffffff",
    align: "center",
  },
  {
    type: "text",
    role: "ayuda",
    x: 8,
    y: 48,
    width: 89,
    height: 8,
    rotation: 0,
    text: "Escaneá acá, en Google",
    font: "source",
    fontSize: 3.8,
    fill: "#ffffff",
    align: "center",
  },
  {
    type: "qr",
    role: "qr",
    x: 20.5,
    y: 70,
    width: 64,
    height: 64,
    rotation: 0,
    value: "",
    foreground: QR_INK,
    background: QR_PAPER,
  },
];

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
  clasico: { background: templatePalettes.clasico.background, frames: clasico },
  vivo: { background: templatePalettes.vivo.background, frames: vivo },
  nocturno: { background: templatePalettes.nocturno.background, frames: nocturno },
  negocio: { background: templatePalettes.negocio.background, frames: negocio },
  corporativo: { background: templatePalettes.corporativo.background, frames: corporativo },
  creativo: { background: templatePalettes.creativo.background, frames: creativo },
};

/**
 * Where each piece goes on sheets that are not portrait. Same roles as the A6
 * frames above, so texts, colors and palettes carry over between formats.
 * `size` is the type size for texts and the corner radius for rectangles.
 */
type Placement = { x: number; y: number; width: number; height: number; size?: number; align?: TextAlign };
type ShapeLayout = Record<TemplateId, Record<string, Placement>>;

/** Square pieces (labels, posts), drawn on a 100 × 100 mm base. */
const SQUARE_BASE: Sheet = { widthMm: 100, heightMm: 100 };
const squareLayouts: ShapeLayout = {
  clasico: {
    rubro: { x: 8, y: 6, width: 84, height: 7, size: 4.6 },
    titulo: { x: 8, y: 14, width: 84, height: 17.5, size: 6.5 },
    acento: { x: 38, y: 33.5, width: 24, height: 1.6, size: 0.8 },
    marco: { x: 27, y: 38, width: 46, height: 46 },
    qr: { x: 30, y: 41, width: 40, height: 40 },
    ayuda: { x: 8, y: 87.5, width: 84, height: 10, size: 3.6 },
  },
  vivo: {
    riel: { x: 0, y: 0, width: 14, height: 100 },
    banda: { x: 14, y: 0, width: 86, height: 34 },
    titulo: { x: 19, y: 6.5, width: 75, height: 21, size: 7.5 },
    placa: { x: 9, y: 39, width: 84, height: 43, size: 2 },
    qr: { x: 31, y: 40.5, width: 40, height: 40 },
    ayuda: { x: 19, y: 86, width: 75, height: 10, size: 3.8 },
  },
  nocturno: {
    franja: { x: 0, y: 0, width: 100, height: 3.5 },
    rubro: { x: 8, y: 8, width: 84, height: 6, size: 3.6 },
    titulo: { x: 8, y: 15.5, width: 84, height: 19, size: 7 },
    placa: { x: 28, y: 38.5, width: 44, height: 44, size: 2 },
    qr: { x: 30, y: 40.5, width: 40, height: 40 },
    ayuda: { x: 8, y: 87, width: 84, height: 10, size: 3.8 },
  },
  negocio: {
    rubro: { x: 8, y: 6, width: 84, height: 11, size: 8 },
    banda: { x: 0, y: 20, width: 100, height: 22 },
    titulo: { x: 6, y: 23, width: 88, height: 8, size: 5 },
    ayuda: { x: 6, y: 33, width: 88, height: 6, size: 3.6 },
    qr: { x: 28, y: 48, width: 44, height: 44 },
  },
  corporativo: {
    banda: { x: 0, y: 0, width: 100, height: 18 },
    rubro: { x: 8, y: 6, width: 84, height: 7, size: 3.8 },
    titulo: { x: 8, y: 24, width: 84, height: 20, size: 7.5 },
    bajada: { x: 8, y: 47, width: 43, height: 21, size: 3.6 },
    acento: { x: 8, y: 71.5, width: 20, height: 2.4, size: 1 },
    ayuda: { x: 8, y: 78, width: 43, height: 14, size: 3.4 },
    qr: { x: 56, y: 50, width: 38, height: 38 },
  },
  creativo: {
    mancha: { x: 6, y: 6, width: 88, height: 34, size: 4 },
    titulo: { x: 11, y: 11.5, width: 78, height: 24, size: 7.5 },
    bajada: { x: 8, y: 45, width: 42, height: 22, size: 3.8 },
    ayuda: { x: 8, y: 71, width: 42, height: 14, size: 3.4 },
    qr: { x: 54, y: 46, width: 40, height: 40 },
  },
};

/** Landscape pieces, drawn on a business card (85 × 55 mm): text on the left, code on the right. */
const LANDSCAPE_BASE: Sheet = { widthMm: 85, heightMm: 55 };
const landscapeLayouts: ShapeLayout = {
  clasico: {
    rubro: { x: 5, y: 6, width: 42, height: 5, size: 3, align: "left" },
    titulo: { x: 5, y: 13, width: 42, height: 17, size: 4.4, align: "left" },
    acento: { x: 5, y: 32.5, width: 14, height: 1.2, size: 0.6 },
    marco: { x: 50.5, y: 11.5, width: 32, height: 32 },
    qr: { x: 52.5, y: 13.5, width: 28, height: 28 },
    ayuda: { x: 5, y: 37, width: 42, height: 12, size: 2.6, align: "left" },
  },
  vivo: {
    riel: { x: 0, y: 0, width: 6, height: 55 },
    banda: { x: 6, y: 0, width: 79, height: 19 },
    titulo: { x: 10, y: 3.5, width: 71, height: 12, size: 4.4 },
    placa: { x: 48.5, y: 22, width: 32, height: 30, size: 1.2 },
    qr: { x: 51, y: 23.5, width: 27, height: 27 },
    ayuda: { x: 10, y: 26, width: 35, height: 22, size: 2.8 },
  },
  nocturno: {
    franja: { x: 0, y: 0, width: 85, height: 2.2 },
    rubro: { x: 5, y: 7, width: 42, height: 5, size: 2.6 },
    titulo: { x: 5, y: 13.5, width: 42, height: 22.5, size: 4.4 },
    placa: { x: 50.5, y: 11.5, width: 32, height: 32, size: 1.2 },
    qr: { x: 52.5, y: 13.5, width: 28, height: 28 },
    ayuda: { x: 5, y: 40, width: 42, height: 10, size: 2.6, align: "left" },
  },
  negocio: {
    rubro: { x: 5, y: 5, width: 44, height: 8, size: 5 },
    banda: { x: 0, y: 17, width: 50, height: 30 },
    titulo: { x: 5, y: 20.5, width: 41, height: 13, size: 4, align: "left" },
    ayuda: { x: 5, y: 35.5, width: 41, height: 9, size: 2.6, align: "left" },
    qr: { x: 53, y: 12.5, width: 30, height: 30 },
  },
  corporativo: {
    banda: { x: 0, y: 0, width: 85, height: 11 },
    rubro: { x: 5, y: 3.4, width: 75, height: 5, size: 2.8 },
    titulo: { x: 5, y: 15, width: 45, height: 12, size: 4.6 },
    bajada: { x: 5, y: 28.5, width: 45, height: 9.5, size: 2.4 },
    acento: { x: 5, y: 40.5, width: 12, height: 1.4, size: 0.6 },
    ayuda: { x: 5, y: 44.5, width: 45, height: 7, size: 2.4 },
    qr: { x: 54.5, y: 18, width: 27, height: 27 },
  },
  creativo: {
    mancha: { x: 4, y: 4, width: 46, height: 27, size: 2.5 },
    titulo: { x: 7, y: 7.5, width: 40, height: 20, size: 4.6 },
    bajada: { x: 5, y: 34, width: 45, height: 10, size: 2.5 },
    ayuda: { x: 5, y: 45.5, width: 45, height: 6.5, size: 2.3 },
    qr: { x: 54, y: 13.5, width: 28, height: 28 },
  },
};

function shapeFrames(templateId: TemplateId, layout: ShapeLayout): Frame[] {
  const placements = layout[templateId];
  return templates[templateId].frames.flatMap((frame): Frame[] => {
    const spot = placements[frame.role];
    if (!spot) return [];
    const box = { x: spot.x, y: spot.y, width: spot.width, height: spot.height };
    if (frame.type === "text") {
      return [{ ...frame, ...box, fontSize: spot.size ?? frame.fontSize, align: spot.align ?? frame.align }];
    }
    if (frame.type === "rect") return [{ ...frame, ...box, cornerRadius: spot.size ?? 0 }];
    return [{ ...frame, ...box }];
  });
}

/** Stretches a base layout to a sheet of the same shape. The QR and its type sizes scale evenly. */
function fitFrames(frames: Frame[], base: Sheet, sheet: Sheet): Frame[] {
  const sx = sheet.widthMm / base.widthMm;
  const sy = sheet.heightMm / base.heightMm;
  if (sx === 1 && sy === 1) return frames;
  const scale = Math.min(sx, sy);
  return frames.map((frame): Frame => {
    if (frame.type === "qr") {
      const size = mm(clamp(frame.width * scale, QR_MIN_MM, qrMaxMm(sheet)));
      return {
        ...frame,
        x: mm((frame.x + frame.width / 2) * sx - size / 2),
        y: mm((frame.y + frame.height / 2) * sy - size / 2),
        width: size,
        height: size,
      };
    }
    // Same minimum sizes normalizeElement enforces, so a saved design reads back identical.
    const box = {
      x: mm(frame.x * sx),
      y: mm(frame.y * sy),
      width: mm(Math.max(frame.type === "text" ? 8 : 1, frame.width * sx)),
      height: mm(Math.max(frame.type === "text" ? 4 : 1, frame.height * sy)),
    };
    if (frame.type === "text") return { ...frame, ...box, fontSize: mm(Math.max(2, frame.fontSize * scale)) };
    return { ...frame, ...box, cornerRadius: mm(frame.cornerRadius * scale) };
  });
}

/** The composition of a template on a given sheet. A6 gets the original frames untouched. */
function templateFrames(templateId: TemplateId, sheet: Sheet): Frame[] {
  const shape = formatShape(sheet);
  if (shape === "square") return fitFrames(shapeFrames(templateId, squareLayouts), SQUARE_BASE, sheet);
  if (shape === "landscape") return fitFrames(shapeFrames(templateId, landscapeLayouts), LANDSCAPE_BASE, sheet);
  return fitFrames(templates[templateId].frames, A6_SHEET, sheet);
}

export function createDocument(
  templateId: TemplateId,
  idFor: IdFactory = createId,
  formatId: FormatId = DEFAULT_FORMAT_ID,
): DesignDocumentV8 {
  return applyTemplate(emptyDocument(templateId, designFormat(formatId)), templateId, { idFor, applyPalette: true });
}

/** Minimal board: title + QR. Not a locked layout — everything stays editable. */
export function createBlankDocument(
  idFor: IdFactory = createId,
  formatId: FormatId = DEFAULT_FORMAT_ID,
): DesignDocumentV8 {
  const format = designFormat(formatId);
  const frames = fitFrames(
    [
      {
        type: "text",
        role: "titulo",
        x: 10,
        y: 18,
        width: 85,
        height: 22,
        rotation: 0,
        text: "Tu mensaje",
        font: "sora",
        fontSize: 9,
        fill: "#14221f",
        align: "center",
      },
      {
        type: "qr",
        role: "qr",
        x: 28.5,
        y: 52,
        width: 48,
        height: 48,
        rotation: 0,
        value: "",
        foreground: QR_INK,
        background: QR_PAPER,
      },
    ],
    A6_SHEET,
    format,
  );
  return {
    version: STUDIO_VERSION,
    format,
    background: "#ffffff",
    templateId: "clasico",
    layouts: {},
    elements: frames.map((frame) => createFromFrame(frame, idFor(frame.type === "qr" ? "qr" : "text"), format)),
    parked: [],
  };
}

/**
 * Moves a design to another sheet size without dropping or duplicating anything.
 * Pieces still sitting where the template put them take the same slot of the new
 * format; everything else (moved pieces, added texts, images) keeps its relative
 * spot. Saved arrangements of other templates are in the old size and are cleared.
 */
export function changeFormat(document: DesignDocumentV8, formatId: FormatId): DesignDocumentV8 {
  if (document.format.id === formatId) return document;
  const from = document.format;
  const to = designFormat(formatId);
  const oldFrames = templateFrames(document.templateId, from);
  const newFrames = templateFrames(document.templateId, to);
  const sx = to.widthMm / from.widthMm;
  const sy = to.heightMm / from.heightMm;
  const scale = Math.min(sx, sy);
  const taken = new Set<string>();

  const move = (element: StudioElement): StudioElement => {
    const slot = element.role && !taken.has(element.role) ? slotFor(element, oldFrames, newFrames) : null;
    if (slot && element.role) {
      taken.add(element.role);
      const box = { x: slot.next.x, y: slot.next.y, width: slot.next.width, height: slot.next.height, rotation: 0 };
      if (element.type === "text" && slot.next.type === "text" && slot.previous.type === "text") {
        const wanted = slot.next.fontSize * (element.fontSize / slot.previous.fontSize);
        const fontSize = estimateFittingSize({
          text: element.text,
          font: element.font,
          fontSize: wanted,
          width: box.width,
          height: box.height,
          floor: Math.max(2, wanted * 0.6),
        });
        // The alignment follows the composition only where the composition itself changes it.
        const align = slot.previous.align === slot.next.align ? element.align : slot.next.align;
        return normalizeElement({ ...element, ...box, fontSize, align }, to);
      }
      if (element.type === "rect" && slot.next.type === "rect") {
        return normalizeElement({ ...element, ...box, cornerRadius: slot.next.cornerRadius }, to);
      }
      return normalizeElement({ ...element, ...box }, to);
    }

    const centerX = (element.x + element.width / 2) * sx;
    const centerY = (element.y + element.height / 2) * sy;
    // Bands and text blocks stretch with the sheet; images and the code keep their proportions.
    const even = element.type === "image" || element.type === "qr";
    const width = element.width * (even ? scale : sx);
    const height = element.height * (even ? scale : sy);
    const box = { x: centerX - width / 2, y: centerY - height / 2, width, height };
    if (element.type === "text") {
      return normalizeElement({ ...element, ...box, fontSize: Math.max(2, element.fontSize * scale) }, to);
    }
    if (element.type === "rect") {
      return normalizeElement({ ...element, ...box, cornerRadius: element.cornerRadius * scale }, to);
    }
    return normalizeElement({ ...element, ...box }, to);
  };

  return {
    version: STUDIO_VERSION,
    format: to,
    background: document.background,
    templateId: document.templateId,
    layouts: {},
    elements: document.elements.map(move),
    parked: document.parked.map(move),
  };
}

/** The template slot an element still occupies (within 1 mm), and the same slot on the new sheet. */
function slotFor(
  element: StudioElement,
  oldFrames: Frame[],
  newFrames: Frame[],
): { previous: Frame; next: Frame } | null {
  const previous = oldFrames.find((frame) => frame.role === element.role && frame.type === element.type);
  const next = newFrames.find((frame) => frame.role === element.role && frame.type === element.type);
  if (!previous || !next || element.rotation !== 0) return null;
  const near = (a: number, b: number) => Math.abs(a - b) <= 1;
  const inPlace =
    near(element.x, previous.x) &&
    near(element.y, previous.y) &&
    near(element.width, previous.width) &&
    near(element.height, previous.height);
  return inPlace ? { previous, next } : null;
}

export type ApplyTemplateOptions = {
  idFor?: IdFactory;
  /** When true, also paints the suggested background and role colors. */
  applyPalette?: boolean;
};

/**
 * Switches composition while keeping user content.
 * Saves the current arrangement into layouts[current] and restores layouts[next] when present.
 * Pieces a template generated (bands, rails, frames) belong to that template: they are not
 * carried over or parked, they come back when the user returns to it. Elements the user added
 * (role null) and images stay on the sheet where they were. Background is preserved unless
 * applyPalette is set.
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
  // Only user content stays in the parked list; old template leftovers are dropped.
  const keptParked = document.parked.filter((item) => item.type !== "qr" && isUserContent(item));
  let next: DesignDocumentV8;

  if (saved) {
    next = restoreSavedLayout(document, templateId, saved, pool, layouts, keptParked);
  } else {
    next = buildFromFrames(document, templateId, pool, layouts, idFor, keptParked);
  }

  if (applyPalette) {
    next = applySuggestedColors(next);
  }
  return next;
}

/**
 * Texts the user wrote that the new composition has no place for. They are not lost
 * (layouts keep them for the previous template and undo works), but the editor says so.
 */
export function hiddenEditedTexts(before: DesignDocumentV8, after: DesignDocumentV8): TextElement[] {
  const shown = new Set([...after.elements, ...after.parked].map((item) => item.id));
  return before.elements.filter((item): item is TextElement => {
    if (item.type !== "text" || shown.has(item.id)) return false;
    // Role and text are the same on every sheet shape, so the A6 frames are enough here.
    const text = item.text.trim();
    if (!text) return false;
    return !Object.values(templates).some((template) =>
      template.frames.some((frame) => frame.type === "text" && frame.role === item.role && frame.text === text),
    );
  });
}

/** Drops parked pieces that templates generated (left by older versions of the editor). */
export function withoutTemplateLeftovers(document: DesignDocumentV8): DesignDocumentV8 {
  const parked = document.parked.filter((item) => item.type !== "qr" && isUserContent(item));
  return parked.length === document.parked.length ? document : { ...document, parked };
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
  keptParked: StudioElement[],
): DesignDocumentV8 {
  const byId = new Map(pool.map((item) => [item.id, item]));
  const parkedIds = new Set(keptParked.map((item) => item.id));
  const used = new Set<string>();
  const elements: StudioElement[] = [];

  for (const snapshot of saved.elements) {
    const live = byId.get(snapshot.id);
    // User content deleted or parked since then must not come back with the old layout.
    if (isUserContent(snapshot) && (!live || parkedIds.has(snapshot.id))) continue;
    used.add(snapshot.id);
    elements.push(mergeContent(snapshot, live ?? snapshot, document.format));
  }

  const carried = pool.filter(
    (item) => !used.has(item.id) && !parkedIds.has(item.id) && item.type !== "qr" && isUserContent(item),
  );
  const withQr = withCarried(ensureSingleQr(elements, pool, document.format), carried);
  return {
    version: STUDIO_VERSION,
    format: document.format,
    background: document.background,
    templateId,
    layouts,
    elements: withQr,
    parked: keptParked.filter((item) => !withQr.some((element) => element.id === item.id)).slice(0, MAX_PARKED),
  };
}

/** Keeps the elements the user added on the sheet, below the QR, up to the element limit. */
function withCarried(elements: StudioElement[], carried: StudioElement[]): StudioElement[] {
  const room = Math.max(0, MAX_ELEMENTS - elements.length);
  const extra = carried.slice(0, room).map(cloneElement);
  if (extra.length === 0) return elements;
  const qrIndex = elements.findIndex((item) => item.type === "qr");
  if (qrIndex < 0) return [...elements, ...extra];
  return [...elements.slice(0, qrIndex), ...extra, ...elements.slice(qrIndex)];
}

function buildFromFrames(
  document: DesignDocumentV8,
  templateId: TemplateId,
  pool: StudioElement[],
  layouts: DesignDocumentV8["layouts"],
  idFor: IdFactory,
  keptParked: StudioElement[],
): DesignDocumentV8 {
  const parkedIds = new Set(keptParked.map((item) => item.id));
  const format = document.format;
  const used = new Set<string>();
  const elements: StudioElement[] = [];

  for (const frame of templateFrames(templateId, format)) {
    const match = pool.find((item) => !used.has(item.id) && item.role === frame.role && item.type === frame.type);
    if (match) {
      used.add(match.id);
      elements.push(placeFrameKeepStyle(match, frame, format));
    } else {
      const contentMatch =
        frame.type === "text"
          ? pool.find((item) => !used.has(item.id) && item.type === "text" && item.role === frame.role)
          : undefined;
      if (contentMatch) {
        used.add(contentMatch.id);
        elements.push(placeFrameKeepStyle(contentMatch, frame, format));
      } else {
        elements.push(createFromFrame(frame, idFor(frame.role), format));
      }
    }
  }

  const carried = pool.filter(
    (item) => !used.has(item.id) && !parkedIds.has(item.id) && item.type !== "qr" && isUserContent(item),
  );
  return {
    version: STUDIO_VERSION,
    format,
    background: document.background,
    templateId,
    layouts,
    elements: withCarried(elements, carried),
    parked: keptParked.slice(0, MAX_PARKED),
  };
}

function emptyDocument(templateId: TemplateId, format: DesignFormat): DesignDocumentV8 {
  return {
    version: STUDIO_VERSION,
    format,
    background: templates[templateId].background,
    templateId,
    layouts: {},
    elements: [],
    parked: [],
  };
}

/** Keep user colors/fonts when placing into a new frame; only take geometry from the frame. */
function placeFrameKeepStyle(element: StudioElement, frame: Frame, sheet: Sheet): StudioElement {
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
    return clampQrGeometry({ ...element, ...box, role: frame.role }, sheet);
  }
  return element;
}

function createFromFrame(frame: Frame, id: string, sheet: Sheet): StudioElement {
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
  return clampQrGeometry(
    {
      ...base,
      type: "qr",
      value: frame.value,
      foreground: frame.foreground,
      background: frame.background,
    },
    sheet,
  );
}

function mergeContent(snapshot: StudioElement, live: StudioElement, sheet: Sheet): StudioElement {
  if (snapshot.type === "text" && live.type === "text") {
    return { ...snapshot, text: live.text };
  }
  if (snapshot.type === "image" && live.type === "image") {
    return { ...snapshot, src: live.src, alt: live.alt };
  }
  if (snapshot.type === "qr" && live.type === "qr") {
    return clampQrGeometry(
      {
        ...snapshot,
        value: live.value,
        foreground: live.foreground,
        background: live.background,
      },
      sheet,
    );
  }
  if (snapshot.type === "rect" && live.type === "rect") {
    return snapshot;
  }
  return snapshot;
}

function ensureSingleQr(elements: StudioElement[], pool: StudioElement[], sheet: Sheet): StudioElement[] {
  const existing = elements.find((item) => item.type === "qr");
  if (existing) return elements.map((item) => (item.type === "qr" ? clampQrGeometry(item, sheet) : item));
  const fromPool = pool.find((item): item is QrElement => item.type === "qr");
  if (fromPool) return [...elements, clampQrGeometry(fromPool, sheet)];
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
