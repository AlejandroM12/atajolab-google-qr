import { isHexColor } from "@/lib/color";
import { templateColors, templateTones, type TemplateColors } from "@/lib/studio/template-colors";
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
  RECT_MIN_MM,
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
  /** Role of the shape this single line sits on (a pill): the text stays centered in it. */
  centerIn?: string;
};

type RectFrame = FrameBase & {
  type: "rect";
  fill: string;
  cornerRadius: number;
  /** Keeps its proportions on other sheets (circles, squares around the code). */
  even?: boolean;
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
    description: "Marco fino, serif y el código enmarcado.",
  },
  {
    id: "vivo",
    name: "Vivo",
    description: "Bloque de color, tarjeta blanca y botón.",
  },
  {
    id: "nocturno",
    name: "Nocturno",
    description: "Fondo oscuro y el código con borde luminoso.",
  },
  {
    id: "negocio",
    name: "Mi negocio",
    description: "Tu nombre bien grande y el código en un sello.",
  },
  {
    id: "corporativo",
    name: "Corporativo",
    description: "Encabezado, datos en orden y el código al pie.",
  },
  {
    id: "creativo",
    name: "Creativo",
    description: "Color pleno, título inclinado y sombra dura.",
  },
];

export const suggestedTemplates = templateList.filter((template) =>
  suggestedTemplateIds.includes(template.id),
);

/** Suggested palette for each template. Applied only when the user asks. */
export const templatePalettes: Record<TemplateId, TemplateColors> = {
  clasico: templateColors("clasico", templateTones.clasico),
  vivo: templateColors("vivo", templateTones.vivo),
  nocturno: templateColors("nocturno", templateTones.nocturno),
  negocio: templateColors("negocio", templateTones.negocio),
  corporativo: templateColors("corporativo", templateTones.corporativo),
  creativo: templateColors("creativo", templateTones.creativo),
};

/* Frame builders. Colors come from templatePalettes by role, so they are not repeated here. */

function text(
  role: string,
  box: [x: number, y: number, width: number, height: number],
  content: string,
  font: StudioFont,
  fontSize: number,
  align: TextAlign = "left",
  extra: { rotation?: number; centerIn?: string } = {},
): TextFrame {
  return {
    type: "text",
    role,
    x: box[0],
    y: box[1],
    width: box[2],
    height: box[3],
    rotation: extra.rotation ?? 0,
    text: content,
    font,
    fontSize,
    fill: "#1c1915",
    align,
    centerIn: extra.centerIn,
  };
}

function rect(
  role: string,
  box: [x: number, y: number, width: number, height: number],
  extra: { radius?: number; rotation?: number; even?: boolean } = {},
): RectFrame {
  return {
    type: "rect",
    role,
    x: box[0],
    y: box[1],
    width: box[2],
    height: box[3],
    rotation: extra.rotation ?? 0,
    fill: "#1c1915",
    cornerRadius: extra.radius ?? 0,
    even: extra.even,
  };
}

function qr(x: number, y: number, size: number, foreground: string = QR_INK): QrFrame {
  return {
    type: "qr",
    role: "qr",
    x,
    y,
    width: size,
    height: size,
    rotation: 0,
    value: "",
    foreground,
    background: QR_PAPER,
  };
}

/** Editorial: a hairline frame, a serif headline, an ornament and the code in a dark frame. */
const clasico: Frame[] = [
  rect("linea-sup", [5, 5, 95, 0.5]),
  rect("linea-inf", [5, 142.5, 95, 0.5]),
  rect("linea-izq", [5, 5, 0.5, 138]),
  rect("linea-der", [99.5, 5, 0.5, 138]),
  text("rubro", [12, 13, 81, 5], "TU NEGOCIO", "source-bold", 3.4, "center"),
  text("titulo", [12, 21, 81, 24], "Tu opinión nos importa", "fraunces-bold", 9.2, "center"),
  rect("regla-izq", [33, 50.25, 15, 0.5]),
  rect("rombo", [51, 49, 3, 3], { rotation: 45, even: true }),
  rect("regla-der", [57, 50.25, 15, 0.5]),
  rect("marco", [25, 57.5, 55, 55], { even: true }),
  qr(26.5, 59, 52),
  text("cta", [12, 118.5, 81, 5], "ESCANEÁ ACÁ", "source-bold", 3.4, "center"),
  text("ayuda", [12, 125.5, 81, 12], "Dejanos tu reseña en Google", "fraunces", 4.6, "center"),
];

/** Poster: a block of color with a big headline, the code on a white card and a button. */
const vivo: Frame[] = [
  rect("banda", [0, 0, 105, 66]),
  rect("circulo", [77, 6, 20, 20], { radius: 10, even: true }),
  rect("punto", [66, 8, 6, 6], { radius: 3, even: true }),
  text("rubro", [9, 10.5, 56, 5], "TU NEGOCIO", "source-bold", 3.4),
  text("titulo", [9, 28, 87, 26.5], "Seguinos en Instagram", "sora-bold", 10),
  rect("placa", [22.5, 56, 60, 60], { radius: 5, even: true }),
  qr(27.5, 61, 50),
  rect("pildora", [25, 121, 55, 10.5], { radius: 5.25 }),
  text("cta", [28, 123.5, 49, 5.5], "Escaneá y seguinos", "sora-bold", 4.2, "center", { centerIn: "pildora" }),
  text("ayuda", [9, 135, 87, 9.5], "@tunegocio", "source", 3.7, "center"),
];

/** Dark and quiet: an accent bar by the headline and the code inside a glowing border. */
const nocturno: Frame[] = [
  rect("barra", [10, 15, 1.6, 34]),
  text("rubro", [16, 15, 79, 5], "TU NEGOCIO", "source-bold", 3.4),
  text("titulo", [16, 22.5, 79, 23], "Mirá nuestra carta", "sora", 9),
  rect("brillo", [21.5, 58, 62, 62], { radius: 6, even: true }),
  rect("placa", [23.5, 60, 58, 58], { radius: 4.5, even: true }),
  qr(27.5, 64, 50, "#121417"),
  text("cta", [10, 126, 85, 6], "Escaneá y mirá", "sora-bold", 4.6, "center"),
  text("ayuda", [10, 134, 85, 10], "Menú siempre actualizado", "source", 3.8, "center"),
];

/** Brand first: the name as the headline and the code inside a round seal. */
const negocio: Frame[] = [
  text("rubro", [10, 9, 85, 14], "Tu negocio", "sora-bold", 11),
  rect("acento", [10, 26.5, 16, 2], { radius: 1 }),
  text("titulo", [10, 33, 85, 16], "Escribinos por WhatsApp", "sora", 6.2),
  rect("sello", [15.5, 52, 74, 74], { radius: 37, even: true }),
  rect("placa", [29.5, 66, 46, 46], { radius: 3, even: true }),
  qr(32.5, 69, 40),
  text("cta", [10, 129.5, 85, 6], "Escaneá y chateá", "sora-bold", 4.6, "center"),
  text("ayuda", [10, 137, 85, 9.5], "Te respondemos por chat", "source", 3.8, "center"),
];

/** Structured: a header band, information in order and the code on a tinted footer. */
const corporativo: Frame[] = [
  rect("banda", [0, 0, 105, 22]),
  text("rubro", [10, 8.5, 85, 5], "TU NEGOCIO", "source-bold", 3.6),
  text("titulo", [10, 32, 85, 22], "Wi-Fi para clientes", "sora-bold", 8.6),
  rect("acento", [10, 57.5, 18, 1.6], { radius: 0.8 }),
  text("bajada", [10, 64, 85, 16], "Conectate sin escribir la contraseña.", "source", 4.2),
  rect("panel", [0, 88, 105, 60]),
  rect("placa", [48, 93, 50, 50], { radius: 3, even: true }),
  text("cta", [10, 98, 34, 13], "Escaneá el código", "sora-bold", 5),
  text("ayuda", [10, 114, 34, 23], "Abrí la cámara de tu celular y apuntá al código.", "source", 3.6),
  qr(51, 96, 44),
];

/** Playful: full color, a tilted sticker for the headline and the code with a hard shadow. */
const creativo: Frame[] = [
  text("rubro", [10, 6, 85, 5], "TU NEGOCIO", "source-bold", 3.4),
  rect("mancha", [9, 16, 84, 40], { radius: 4, rotation: -4 }),
  text("titulo", [15, 22, 72, 24], "Te esperamos en el evento", "sora-bold", 9.4, "left", { rotation: -4 }),
  text("bajada", [10, 64, 85, 11.5], "Fecha, lugar y entradas en un escaneo.", "source", 4.4),
  rect("sombra", [12.5, 84.5, 54, 54], { radius: 3, even: true }),
  rect("placa", [10, 82, 54, 54], { radius: 3, even: true }),
  qr(13, 85, 48),
  text("cta", [70, 85, 27, 20], "Escaneá y sumate", "sora-bold", 5.2),
  text("ayuda", [70, 108, 27, 26], "Abrí la cámara y apuntá al código.", "source", 3.4),
  rect("punto-a", [70, 138, 4, 4], { radius: 2, even: true }),
  rect("punto-b", [77, 138, 4, 4], { radius: 2, even: true }),
  rect("punto-c", [84, 138, 4, 4], { radius: 2, even: true }),
];

function painted(templateId: TemplateId, frames: Frame[]): { background: string; frames: Frame[] } {
  const palette = templatePalettes[templateId];
  return {
    background: palette.background,
    frames: frames.map((frame) => {
      const fill = palette.fills[frame.role];
      return frame.type === "qr" || !fill ? frame : { ...frame, fill };
    }),
  };
}

const templates: Record<TemplateId, { background: string; frames: Frame[] }> = {
  clasico: painted("clasico", clasico),
  vivo: painted("vivo", vivo),
  nocturno: painted("nocturno", nocturno),
  negocio: painted("negocio", negocio),
  corporativo: painted("corporativo", corporativo),
  creativo: painted("creativo", creativo),
};

/**
 * Where each piece goes on sheets that are not portrait. Same roles as the A6
 * frames above, so texts, colors and palettes carry over between formats.
 * `size` is the type size for texts and the corner radius for rectangles.
 */
type Placement = {
  x: number;
  y: number;
  width: number;
  height: number;
  size?: number;
  align?: TextAlign;
  rotation?: number;
};
type ShapeLayout = Record<TemplateId, Record<string, Placement>>;

function at(
  x: number,
  y: number,
  width: number,
  height: number,
  size?: number,
  extra: { align?: TextAlign; rotation?: number } = {},
): Placement {
  return { x, y, width, height, size, ...extra };
}

/** Square pieces (labels, posts), drawn on a 100 × 100 mm base. */
const SQUARE_BASE: Sheet = { widthMm: 100, heightMm: 100 };
const squareLayouts: ShapeLayout = {
  clasico: {
    "linea-sup": at(4, 4, 92, 0.5),
    "linea-inf": at(4, 95.5, 92, 0.5),
    "linea-izq": at(4, 4, 0.5, 92),
    "linea-der": at(95.5, 4, 0.5, 92),
    rubro: at(10, 9, 80, 5, 3.4),
    titulo: at(10, 15, 80, 17.5, 6.8),
    "regla-izq": at(33, 34.5, 13, 0.5),
    rombo: at(48.6, 33.35, 2.8, 2.8),
    "regla-der": at(54, 34.5, 13, 0.5),
    marco: at(30, 38, 40, 40),
    qr: at(31.5, 39.5, 37, 37),
    cta: at(10, 80, 80, 4.5, 3),
    ayuda: at(10, 85, 80, 5, 3),
  },
  vivo: {
    banda: at(0, 0, 100, 44),
    circulo: at(81, 4, 13, 13, 6.5),
    punto: at(73, 5.5, 4.5, 4.5, 2.25),
    rubro: at(8, 6.5, 60, 9, 3.4),
    titulo: at(8, 17.5, 84, 19.5, 7.6),
    placa: at(29, 38, 42, 42, 4),
    qr: at(31.5, 40.5, 37, 37),
    pildora: at(26, 83, 48, 8, 4),
    cta: at(29, 84.9, 42, 4.3, 3.4),
    ayuda: at(8, 92.5, 84, 5, 3),
  },
  nocturno: {
    barra: at(8, 9, 1.4, 24),
    rubro: at(13, 9, 79, 5, 3.4),
    titulo: at(13, 15, 79, 18, 7),
    brillo: at(29, 37, 42, 42, 4.5),
    placa: at(30.5, 38.5, 39, 39, 3.5),
    qr: at(31.5, 39.5, 37, 37),
    cta: at(8, 82, 84, 5.5, 4.2),
    ayuda: at(8, 89, 84, 8, 3.2),
  },
  negocio: {
    rubro: at(8, 6, 84, 10.5, 8.2),
    acento: at(8, 18.5, 13, 1.6, 0.8),
    titulo: at(8, 22.5, 84, 7, 5),
    sello: at(21.5, 30, 57, 57, 28.5),
    placa: at(30.5, 39, 39, 39, 2.5),
    qr: at(31.5, 40, 37, 37),
    cta: at(8, 88, 84, 4.6, 3.6),
    ayuda: at(8, 93, 84, 4.5, 3),
  },
  corporativo: {
    banda: at(0, 0, 100, 15),
    rubro: at(8, 5.2, 84, 5, 3.6),
    titulo: at(8, 21, 84, 19, 7.4),
    acento: at(8, 42.5, 15, 1.4, 0.7),
    bajada: at(8, 46.5, 84, 8.5, 3.3),
    panel: at(0, 56, 100, 44),
    placa: at(54, 58, 40, 40, 2.5),
    cta: at(8, 62, 42, 11.5, 4.6),
    ayuda: at(8, 76, 42, 17, 3.3),
    qr: at(55.5, 59.5, 37, 37),
  },
  creativo: {
    rubro: at(8, 5, 84, 5, 3.4),
    mancha: at(8, 13, 84, 27, 3.5, { rotation: -3 }),
    titulo: at(13, 17.5, 74, 18, 7, { rotation: -3 }),
    bajada: at(8, 45.5, 84, 5, 3.6),
    sombra: at(11, 56, 41, 41, 2.5),
    placa: at(8.5, 53.5, 41, 41, 2.5),
    qr: at(10.5, 55.5, 37, 37),
    cta: at(56, 56, 36, 13, 5),
    ayuda: at(56, 71, 36, 17, 3.2),
    "punto-a": at(56, 91, 3.5, 3.5, 1.75),
    "punto-b": at(62, 91, 3.5, 3.5, 1.75),
    "punto-c": at(68, 91, 3.5, 3.5, 1.75),
  },
};

/** Landscape pieces, drawn on a business card (85 × 55 mm): text on the left, code on the right. */
const LANDSCAPE_BASE: Sheet = { widthMm: 85, heightMm: 55 };
const landscapeLayouts: ShapeLayout = {
  clasico: {
    "linea-sup": at(3, 3, 79, 0.4),
    "linea-inf": at(3, 51.6, 79, 0.4),
    "linea-izq": at(3, 3, 0.4, 49),
    "linea-der": at(81.6, 3, 0.4, 49),
    rubro: at(7, 7, 37, 6, 2.6, { align: "left" }),
    titulo: at(7, 14, 37, 17, 4.5, { align: "left" }),
    "regla-izq": at(7, 33.9, 8, 0.4),
    rombo: at(16.6, 33, 2.2, 2.2),
    "regla-der": at(20.4, 33.9, 8, 0.4),
    marco: at(47.5, 11, 32, 32),
    qr: at(49, 12.5, 29, 29),
    cta: at(7, 37.5, 37, 4.2, 2.6, { align: "left" }),
    ayuda: at(7, 42, 37, 7.5, 2.6, { align: "left" }),
  },
  vivo: {
    banda: at(0, 0, 46, 55),
    circulo: at(33.5, 4, 8.5, 8.5, 4.25),
    punto: at(28.5, 10, 3.4, 3.4, 1.7),
    rubro: at(5, 5.5, 22.5, 9, 2.6),
    titulo: at(5, 16, 38, 22.5, 4.5),
    placa: at(51.5, 5, 29, 29, 2.5),
    qr: at(53, 6.5, 26, 26),
    pildora: at(51, 37, 30, 6.5, 3.25),
    cta: at(52.5, 38.3, 27, 4, 2.8),
    ayuda: at(49, 45.5, 34, 6.5, 2.4),
  },
  nocturno: {
    barra: at(5, 8, 1, 24),
    rubro: at(9, 7.5, 36, 6, 2.6),
    titulo: at(9, 14, 37, 17, 4.4),
    brillo: at(49, 10.5, 33, 33, 3),
    placa: at(50.25, 11.75, 30.5, 30.5, 2.2),
    qr: at(51.5, 13, 28, 28),
    cta: at(5, 37.5, 40, 5, 3.1, { align: "left" }),
    ayuda: at(5, 43.5, 40, 7, 2.5, { align: "left" }),
  },
  negocio: {
    rubro: at(5, 5, 36, 7.5, 5.2),
    acento: at(5, 14.5, 10, 1.2, 0.6),
    titulo: at(5, 18.5, 34, 16, 4),
    sello: at(40.5, 3, 43, 43, 21.5),
    placa: at(48, 10.5, 28, 28, 2),
    qr: at(49, 11.5, 26, 26),
    cta: at(40.5, 47, 43, 4.5, 2.9),
    ayuda: at(5, 40, 34, 10, 2.6, { align: "left" }),
  },
  corporativo: {
    banda: at(0, 0, 85, 9.5),
    rubro: at(5, 2.6, 75, 4.5, 2.8),
    titulo: at(5, 13.5, 44, 11.5, 4.5),
    acento: at(5, 26.5, 10, 1.1, 0.55),
    bajada: at(5, 29.5, 44, 6.5, 2.5),
    panel: at(52, 9.5, 33, 45.5),
    placa: at(54, 12.5, 29, 29, 2),
    cta: at(54, 44, 29, 4.5, 2.9, { align: "center" }),
    ayuda: at(5, 39.5, 44, 10, 2.5),
    qr: at(55.5, 14, 26, 26),
  },
  creativo: {
    rubro: at(5, 3, 46, 5.5, 2.6),
    mancha: at(4.5, 10, 42, 23, 2.5, { rotation: -4 }),
    titulo: at(8, 13.5, 35, 16, 4.2, { rotation: -4 }),
    bajada: at(5, 37, 42, 6.5, 2.5),
    sombra: at(54, 8.5, 29, 29, 2),
    placa: at(52.5, 7, 29, 29, 2),
    qr: at(54, 8.5, 26, 26),
    cta: at(5, 44.5, 30, 4.5, 3.2),
    ayuda: at(50, 40, 31, 9.5, 2.4),
    "punto-a": at(37, 45.5, 2.5, 2.5, 1.25),
    "punto-b": at(40.5, 45.5, 2.5, 2.5, 1.25),
    "punto-c": at(44, 45.5, 2.5, 2.5, 1.25),
  },
};

function shapeFrames(templateId: TemplateId, layout: ShapeLayout): Frame[] {
  const placements = layout[templateId];
  return templates[templateId].frames.flatMap((frame): Frame[] => {
    const spot = placements[frame.role];
    if (!spot) return [];
    const box = { x: spot.x, y: spot.y, width: spot.width, height: spot.height };
    const rotation = spot.rotation ?? frame.rotation;
    if (frame.type === "text") {
      return [{ ...frame, ...box, rotation, fontSize: spot.size ?? frame.fontSize, align: spot.align ?? frame.align }];
    }
    if (frame.type === "rect") return [{ ...frame, ...box, rotation, cornerRadius: spot.size ?? 0 }];
    return [{ ...frame, ...box }];
  });
}

/** Stretches a base layout to a sheet of the same shape. The QR and its type sizes scale evenly. */
function fitFrames(frames: Frame[], base: Sheet, sheet: Sheet): Frame[] {
  const sx = sheet.widthMm / base.widthMm;
  const sy = sheet.heightMm / base.heightMm;
  if (sx === 1 && sy === 1) return frames;
  const scale = Math.min(sx, sy);
  const fitted = frames.map((frame): Frame => {
    if (frame.type === "rect" && frame.even) {
      const width = mm(Math.max(RECT_MIN_MM, frame.width * scale));
      const height = mm(Math.max(RECT_MIN_MM, frame.height * scale));
      return {
        ...frame,
        x: mm((frame.x + frame.width / 2) * sx - width / 2),
        y: mm((frame.y + frame.height / 2) * sy - height / 2),
        width,
        height,
        cornerRadius: mm(frame.cornerRadius * scale),
      };
    }
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
      width: mm(Math.max(frame.type === "text" ? 8 : RECT_MIN_MM, frame.width * sx)),
      height: mm(Math.max(frame.type === "text" ? 4 : RECT_MIN_MM, frame.height * sy)),
    };
    if (frame.type === "text") return { ...frame, ...box, fontSize: mm(Math.max(2, frame.fontSize * scale)) };
    return { ...frame, ...box, cornerRadius: mm(frame.cornerRadius * scale) };
  });
  return fitted.map((frame) => {
    if (frame.type !== "text" || !frame.centerIn) return frame;
    const host = fitted.find((item) => item.type === "rect" && item.role === frame.centerIn);
    return host ? { ...frame, ...centeredLine(frame.fontSize, host) } : frame;
  });
}

/** Box of one line of text vertically centered on a shape (the type sits a little high in its line). */
function centeredLine(fontSize: number, host: { y: number; height: number }): { y: number; height: number } {
  const line = fontSize * 1.25;
  return { y: mm(host.y + (host.height - line) / 2 + fontSize * 0.1), height: mm(Math.max(4, line)) };
}

/**
 * Puts single-line texts back in the middle of the shape they sit on, after their
 * size changed. Only texts still on their template shape are touched.
 */
export function recenterHostedTexts(document: DesignDocumentV8): DesignDocumentV8 {
  const frames = templateFrames(document.templateId, document.format);
  let changed = false;
  const elements = document.elements.map((element) => {
    if (element.type !== "text" || !element.role) return element;
    const frame = frames.find((item) => item.type === "text" && item.role === element.role);
    if (!frame || frame.type !== "text" || !frame.centerIn) return element;
    const host = document.elements.find((item) => item.type === "rect" && item.role === frame.centerIn);
    if (!host) return element;
    changed = true;
    return normalizeElement({ ...element, ...centeredLine(element.fontSize, host) }, document.format);
  });
  return changed ? { ...document, elements } : document;
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
      const box = {
        x: slot.next.x,
        y: slot.next.y,
        width: slot.next.width,
        height: slot.next.height,
        rotation: slot.next.rotation,
      };
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
  if (!previous || !next || Math.abs(element.rotation - previous.rotation) > 0.5) return null;
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
