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
  type TextAlign,
  type TextElement,
} from "@/lib/studio/types";

/** Demo URL so inspiration previews render a real QR. Users replace it in the editor. */
export const INSPIRATION_DEMO_QR = "https://search.google.com/local/writereview?placeid=ChIJInspirationDemo";

export type InspirationId =
  | "taller"
  | "cafeteria"
  | "peluqueria"
  | "restaurante"
  | "gimnasio"
  | "comercio";

export type InspirationDesign = {
  id: InspirationId;
  name: string;
  business: string;
  description: string;
  document: DesignDocumentV8;
};

type TextSpec = {
  type: "text";
  role: string;
  x: number;
  y: number;
  width: number;
  height?: number;
  text: string;
  font: StudioFont;
  fontSize: number;
  fill: string;
  align: TextAlign;
};

type RectSpec = {
  type: "rect";
  role: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  cornerRadius?: number;
};

type QrSpec = {
  type: "qr";
  role: string;
  x: number;
  y: number;
  width: number;
  height: number;
  foreground: string;
  background: string;
};

type Spec = TextSpec | RectSpec | QrSpec;

function idsFor(seed: string): IdFactory {
  let n = 0;
  return (prefix) => `${seed}-${prefix}-${++n}`;
}

/**
 * Height that fits wrapped lines plus slack so export clipPath / Konva do not crop glyphs.
 * Pure estimate (no fontkit) so this module stays safe in the Studio client bundle.
 * Tests assert the real wrapStudioText metrics still fit.
 */
function fittedTextHeight(input: {
  text: string;
  font: StudioFont;
  fontSize: number;
  width: number;
  min?: number;
}): number {
  const avgChar = input.fontSize * (input.font === "fraunces" ? 0.5 : 0.46);
  const maxChars = Math.max(1, Math.floor((input.width - 0.35) / avgChar));
  let lines = 0;
  for (const paragraph of input.text.replace(/\r\n/g, "\n").split("\n")) {
    if (paragraph.trim().length === 0) {
      lines += 1;
      continue;
    }
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = 0;
    let count = 1;
    for (const word of words) {
      const next = current === 0 ? word.length : current + 1 + word.length;
      if (current > 0 && next > maxChars) {
        count += 1;
        current = word.length;
      } else {
        current = next;
      }
    }
    lines += count;
  }
  // lineHeight matches Konva/export (1.25). Extra slack covers accents + descenders
  // under the alphabetic SVG baseline (see render.ts) and Konva's height clip.
  const lineHeight = input.fontSize * 1.25;
  const needed = lines * lineHeight + Math.max(1.6, input.fontSize * 0.35);
  return Math.max(input.min ?? 0, Math.round(needed * 10) / 10);
}

function build(seed: InspirationId, background: string, specs: Spec[]): DesignDocumentV8 {
  const idFor = idsFor(seed);
  const elements: StudioElement[] = specs.map((spec) => {
    if (spec.type === "text") {
      const height = fittedTextHeight({
        text: spec.text,
        font: spec.font,
        fontSize: spec.fontSize,
        width: spec.width,
        min: spec.height,
      });
      const text: TextElement = {
        id: idFor("text"),
        type: "text",
        role: spec.role,
        x: spec.x,
        y: spec.y,
        width: spec.width,
        height,
        rotation: 0,
        text: spec.text,
        font: spec.font,
        fontSize: spec.fontSize,
        fill: spec.fill,
        align: spec.align,
      };
      return text;
    }
    if (spec.type === "rect") {
      const rect: RectElement = {
        id: idFor("rect"),
        type: "rect",
        role: spec.role,
        x: spec.x,
        y: spec.y,
        width: spec.width,
        height: spec.height,
        rotation: 0,
        fill: spec.fill,
        cornerRadius: spec.cornerRadius ?? 0,
      };
      return rect;
    }
    return clampQrGeometry({
      id: idFor("qr"),
      type: "qr",
      role: spec.role,
      x: spec.x,
      y: spec.y,
      width: spec.width,
      height: spec.height,
      rotation: 0,
      value: INSPIRATION_DEMO_QR,
      foreground: spec.foreground,
      background: spec.background,
    } satisfies QrElement);
  });

  return {
    version: STUDIO_VERSION,
    format: { id: "a6", widthMm: A6_WIDTH_MM, heightMm: A6_HEIGHT_MM },
    background,
    templateId: "clasico",
    layouts: {},
    elements,
    parked: [],
  };
}

/** Fresh copy for the editor so inspiration catalog docs stay immutable. */
export function cloneInspirationDocument(document: DesignDocumentV8, idFor: IdFactory = createId): DesignDocumentV8 {
  return {
    ...document,
    layouts: {},
    parked: [],
    elements: document.elements.map((element) => {
      if (element.type === "text") return { ...element, id: idFor("text") };
      if (element.type === "rect") return { ...element, id: idFor("rect") };
      if (element.type === "image") return { ...element, id: idFor("image") };
      return clampQrGeometry({ ...element, id: idFor("qr") });
    }),
  };
}

export function getInspiration(id: string | null | undefined): InspirationDesign | null {
  if (!id) return null;
  return inspirationDesigns.find((item) => item.id === id) ?? null;
}

export const inspirationDesigns: InspirationDesign[] = [
  {
    id: "taller",
    name: "Automotor",
    business: "Auto Norte",
    description: "Azul eléctrico, azul oscuro y blanco. Estética técnica moderna.",
    document: build("taller", "#e8eef8", [
      { type: "rect", role: "banda", x: 0, y: 0, width: 105, height: 54, fill: "#0a2540" },
      { type: "rect", role: "acento", x: 0, y: 54, width: 105, height: 4, fill: "#1a66ff" },
      {
        type: "text",
        role: "rubro",
        x: 9,
        y: 9,
        width: 87,
        text: "SERVICIO AUTOMOTOR",
        font: "source",
        fontSize: 3.6,
        fill: "#7eb0ff",
        align: "left",
      },
      {
        type: "text",
        role: "titulo",
        x: 9,
        y: 17,
        width: 87,
        text: "Auto Norte",
        font: "sora",
        fontSize: 11,
        fill: "#ffffff",
        align: "left",
      },
      {
        type: "text",
        role: "bajada",
        x: 9,
        y: 36,
        width: 87,
        text: "Dejá tu reseña en Google",
        font: "source",
        fontSize: 5,
        fill: "#d6e6ff",
        align: "left",
      },
      {
        type: "text",
        role: "ayuda",
        x: 9,
        y: 64,
        width: 87,
        text: "Tu opinión mejora nuestro servicio.",
        font: "source",
        fontSize: 4.2,
        fill: "#1a2f4d",
        align: "left",
      },
      { type: "rect", role: "placa", x: 22, y: 72, width: 61, height: 54, fill: "#ffffff", cornerRadius: 2 },
      {
        type: "qr",
        role: "qr",
        x: 26.5,
        y: 74.5,
        width: 49,
        height: 49,
        foreground: "#0a2540",
        background: QR_PAPER,
      },
      {
        type: "text",
        role: "pie",
        x: 9,
        y: 128,
        width: 87,
        text: "Escaneá el código",
        font: "source",
        fontSize: 4.2,
        fill: "#4a6280",
        align: "center",
      },
    ]),
  },
  {
    id: "cafeteria",
    name: "Cafetería",
    business: "Café del Centro",
    description: "Crema y marrón. Estética editorial para mesas y mostrador.",
    document: build("cafeteria", "#f4ebe0", [
      { type: "rect", role: "banda", x: 0, y: 0, width: 105, height: 8, fill: "#4a2c1a" },
      {
        type: "text",
        role: "titulo",
        x: 8,
        y: 16,
        width: 89,
        text: "Café del Centro",
        font: "fraunces",
        fontSize: 9.5,
        fill: "#3b2414",
        align: "center",
      },
      {
        type: "text",
        role: "bajada",
        x: 10,
        y: 36,
        width: 85,
        text: "¿Cómo estuvo el café?",
        font: "fraunces",
        fontSize: 7.2,
        fill: "#3b2414",
        align: "center",
      },
      {
        type: "text",
        role: "ayuda",
        x: 12,
        y: 54,
        width: 81,
        text: "Tu reseña nos ayuda a seguir mejorando.",
        font: "source",
        fontSize: 4,
        fill: "#6a4a34",
        align: "center",
      },
      {
        type: "qr",
        role: "qr",
        x: 26.5,
        y: 66,
        width: 52,
        height: 52,
        foreground: "#3b2414",
        background: QR_PAPER,
      },
      {
        type: "text",
        role: "pie",
        x: 10,
        y: 128,
        width: 85,
        text: "Escaneá acá · Google",
        font: "source",
        fontSize: 4.2,
        fill: "#6a4a34",
        align: "center",
      },
    ]),
  },
  {
    id: "peluqueria",
    name: "Belleza",
    business: "Studio Rosa",
    description: "Rosa suave, blanco y detalles elegantes. Minimalista.",
    document: build("peluqueria", "#fff8fa", [
      { type: "rect", role: "mancha", x: 0, y: 0, width: 105, height: 40, fill: "#f0cfd9" },
      {
        type: "text",
        role: "rubro",
        x: 10,
        y: 10,
        width: 85,
        text: "BELLEZA",
        font: "source",
        fontSize: 3.4,
        fill: "#8a5a6c",
        align: "center",
      },
      {
        type: "text",
        role: "titulo",
        x: 10,
        y: 18,
        width: 85,
        text: "Studio Rosa",
        font: "sora",
        fontSize: 11,
        fill: "#4a2434",
        align: "center",
      },
      {
        type: "text",
        role: "bajada",
        x: 10,
        y: 48,
        width: 85,
        text: "Tu reseña nos alegra",
        font: "sora",
        fontSize: 7,
        fill: "#4a2434",
        align: "center",
      },
      {
        type: "text",
        role: "ayuda",
        x: 12,
        y: 64,
        width: 81,
        text: "Contanos cómo te sentiste hoy.",
        font: "source",
        fontSize: 4,
        fill: "#8a5a6c",
        align: "center",
      },
      { type: "rect", role: "marco", x: 24, y: 72, width: 57, height: 52, fill: "#f0cfd9", cornerRadius: 3 },
      {
        type: "qr",
        role: "qr",
        x: 28.5,
        y: 76,
        width: 48,
        height: 48,
        foreground: "#4a2434",
        background: QR_PAPER,
      },
      {
        type: "text",
        role: "pie",
        x: 10,
        y: 128,
        width: 85,
        text: "Escaneá · Google",
        font: "source",
        fontSize: 4.2,
        fill: "#8a5a6c",
        align: "center",
      },
    ]),
  },
  {
    id: "restaurante",
    name: "Restaurante",
    business: "Mesa 12",
    description: "Colores cálidos para sala y entrada.",
    document: build("restaurante", "#fff6ee", [
      { type: "rect", role: "banda", x: 0, y: 0, width: 105, height: 46, fill: "#c2410c" },
      {
        type: "text",
        role: "titulo",
        x: 9,
        y: 11,
        width: 87,
        text: "Mesa 12",
        font: "fraunces",
        fontSize: 11,
        fill: "#fff7ed",
        align: "center",
      },
      {
        type: "text",
        role: "bajada",
        x: 9,
        y: 30,
        width: 87,
        text: "¿Te gustó la comida?",
        font: "sora",
        fontSize: 5.2,
        fill: "#ffedd5",
        align: "center",
      },
      {
        type: "text",
        role: "ayuda",
        x: 10,
        y: 56,
        width: 85,
        text: "Dejá tu reseña en Google.",
        font: "source",
        fontSize: 4.4,
        fill: "#7c2d12",
        align: "center",
      },
      {
        type: "qr",
        role: "qr",
        x: 26.5,
        y: 68,
        width: 52,
        height: 52,
        foreground: "#7c2d12",
        background: QR_PAPER,
      },
      {
        type: "text",
        role: "pie",
        x: 10,
        y: 128,
        width: 85,
        text: "Escaneá acá · Google",
        font: "source",
        fontSize: 4.2,
        fill: "#9a3412",
        align: "center",
      },
    ]),
  },
  {
    id: "gimnasio",
    name: "Gimnasio",
    business: "Forge Gym",
    description: "Negro y verde, fuerte y legible de lejos.",
    document: build("gimnasio", "#0c1210", [
      { type: "rect", role: "franja", x: 0, y: 0, width: 105, height: 5, fill: "#22c55e" },
      {
        type: "text",
        role: "rubro",
        x: 9,
        y: 14,
        width: 87,
        text: "ENTRENAMIENTO",
        font: "source",
        fontSize: 3.8,
        fill: "#86efac",
        align: "left",
      },
      {
        type: "text",
        role: "titulo",
        x: 9,
        y: 22,
        width: 87,
        text: "Forge Gym",
        font: "sora",
        fontSize: 12,
        fill: "#f0fdf4",
        align: "left",
      },
      {
        type: "text",
        role: "bajada",
        x: 9,
        y: 42,
        width: 87,
        text: "Dejá tu reseña en Google",
        font: "source",
        fontSize: 5,
        fill: "#bbf7d0",
        align: "left",
      },
      { type: "rect", role: "placa", x: 22, y: 54, width: 61, height: 58, fill: "#ffffff", cornerRadius: 2 },
      {
        type: "qr",
        role: "qr",
        x: 26.5,
        y: 57,
        width: 52,
        height: 52,
        foreground: "#052e16",
        background: QR_PAPER,
      },
      {
        type: "text",
        role: "pie",
        x: 9,
        y: 128,
        width: 87,
        text: "Escaneá · Google",
        font: "source",
        fontSize: 4.2,
        fill: "#86efac",
        align: "center",
      },
    ]),
  },
  {
    id: "comercio",
    name: "Comercio",
    business: "Casa Verde",
    description: "Azul y naranja para locales de barrio.",
    document: build("comercio", "#eef4ff", [
      { type: "rect", role: "banda", x: 0, y: 0, width: 105, height: 50, fill: "#ea580c" },
      { type: "rect", role: "riel", x: 0, y: 50, width: 105, height: 4, fill: "#1d4ed8" },
      {
        type: "text",
        role: "titulo",
        x: 9,
        y: 14,
        width: 87,
        text: "Casa Verde",
        font: "sora",
        fontSize: 10.5,
        fill: "#ffffff",
        align: "left",
      },
      {
        type: "text",
        role: "bajada",
        x: 9,
        y: 34,
        width: 87,
        text: "Tu opinión nos importa",
        font: "source",
        fontSize: 5,
        fill: "#ffedd5",
        align: "left",
      },
      {
        type: "text",
        role: "ayuda",
        x: 9,
        y: 60,
        width: 87,
        text: "Escaneá y contanos cómo te atendimos.",
        font: "source",
        fontSize: 4.2,
        fill: "#1e3a8a",
        align: "left",
      },
      {
        type: "qr",
        role: "qr",
        x: 26.5,
        y: 70,
        width: 52,
        height: 52,
        foreground: QR_INK,
        background: QR_PAPER,
      },
      {
        type: "text",
        role: "pie",
        x: 9,
        y: 128,
        width: 87,
        text: "Escaneá acá · Google",
        font: "source",
        fontSize: 4.2,
        fill: "#1e3a8a",
        align: "center",
      },
    ]),
  },
];
