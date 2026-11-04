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
  height: number;
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

function build(seed: InspirationId, background: string, specs: Spec[]): DesignDocumentV8 {
  const idFor = idsFor(seed);
  const elements: StudioElement[] = specs.map((spec) => {
    if (spec.type === "text") {
      const text: TextElement = {
        id: idFor("text"),
        type: "text",
        role: spec.role,
        x: spec.x,
        y: spec.y,
        width: spec.width,
        height: spec.height,
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
    name: "Taller automotor",
    business: "Auto Norte",
    description: "Azul eléctrico y blanco, listo para el mostrador del taller.",
    document: build("taller", "#f4f7fb", [
      { type: "rect", role: "banda", x: 0, y: 0, width: 105, height: 34, fill: "#0b5fff" },
      {
        type: "text",
        role: "rubro",
        x: 10,
        y: 8,
        width: 85,
        height: 8,
        text: "Auto Norte",
        font: "source",
        fontSize: 4,
        fill: "#dce8ff",
        align: "left",
      },
      {
        type: "text",
        role: "titulo",
        x: 10,
        y: 16,
        width: 85,
        height: 14,
        text: "Contanos cómo te fue",
        font: "sora",
        fontSize: 7.5,
        fill: "#ffffff",
        align: "left",
      },
      {
        type: "text",
        role: "bajada",
        x: 10,
        y: 42,
        width: 85,
        height: 14,
        text: "Tu reseña nos ayuda a mejorar el servicio.",
        font: "source",
        fontSize: 4.2,
        fill: "#1c2a44",
        align: "left",
      },
      { type: "rect", role: "placa", x: 24, y: 62, width: 57, height: 57, fill: "#ffffff", cornerRadius: 2 },
      {
        type: "qr",
        role: "qr",
        x: 28.5,
        y: 66.5,
        width: 48,
        height: 48,
        foreground: "#0b1f44",
        background: QR_PAPER,
      },
      {
        type: "text",
        role: "ayuda",
        x: 10,
        y: 126,
        width: 85,
        height: 12,
        text: "Escaneá y dejá tu reseña en Google",
        font: "source",
        fontSize: 3.8,
        fill: "#1c2a44",
        align: "center",
      },
    ]),
  },
  {
    id: "cafeteria",
    name: "Cafetería",
    business: "Café del Centro",
    description: "Crema y marrón, cálido para mesas y mostrador.",
    document: build("cafeteria", "#f3ebe0", [
      { type: "rect", role: "banda", x: 0, y: 0, width: 105, height: 22, fill: "#5c3a21" },
      {
        type: "text",
        role: "rubro",
        x: 10,
        y: 7,
        width: 85,
        height: 10,
        text: "Café del Centro",
        font: "fraunces",
        fontSize: 5.5,
        fill: "#f7efe4",
        align: "left",
      },
      {
        type: "text",
        role: "titulo",
        x: 10,
        y: 32,
        width: 85,
        height: 22,
        text: "¿Cómo estuvo el café?",
        font: "fraunces",
        fontSize: 8,
        fill: "#3b2414",
        align: "left",
      },
      {
        type: "text",
        role: "bajada",
        x: 10,
        y: 56,
        width: 85,
        height: 12,
        text: "Tu opinión nos importa mucho.",
        font: "source",
        fontSize: 4,
        fill: "#6a4a34",
        align: "left",
      },
      { type: "rect", role: "acento", x: 10, y: 72, width: 24, height: 3, fill: "#8b5a2b", cornerRadius: 1 },
      {
        type: "qr",
        role: "qr",
        x: 27.5,
        y: 82,
        width: 50,
        height: 50,
        foreground: "#3b2414",
        background: QR_PAPER,
      },
      {
        type: "text",
        role: "ayuda",
        x: 10,
        y: 136,
        width: 85,
        height: 8,
        text: "Escaneá acá, en Google",
        font: "source",
        fontSize: 3.6,
        fill: "#6a4a34",
        align: "center",
      },
    ]),
  },
  {
    id: "peluqueria",
    name: "Peluquería",
    business: "Studio Rosa",
    description: "Rosa elegante para salones y espacios de belleza.",
    document: build("peluqueria", "#fff5f8", [
      { type: "rect", role: "mancha", x: 8, y: 8, width: 89, height: 42, fill: "#e8a0b5", cornerRadius: 6 },
      {
        type: "text",
        role: "rubro",
        x: 14,
        y: 14,
        width: 77,
        height: 8,
        text: "Studio Rosa",
        font: "source",
        fontSize: 3.8,
        fill: "#5c2438",
        align: "left",
      },
      {
        type: "text",
        role: "titulo",
        x: 14,
        y: 24,
        width: 77,
        height: 20,
        text: "Dejanos tu reseña",
        font: "sora",
        fontSize: 8,
        fill: "#3d1526",
        align: "left",
      },
      {
        type: "text",
        role: "bajada",
        x: 10,
        y: 58,
        width: 85,
        height: 12,
        text: "Contanos cómo te sentiste hoy.",
        font: "source",
        fontSize: 4,
        fill: "#6b3a4c",
        align: "left",
      },
      {
        type: "qr",
        role: "qr",
        x: 30,
        y: 76,
        width: 45,
        height: 45,
        foreground: "#3d1526",
        background: QR_PAPER,
      },
      {
        type: "text",
        role: "ayuda",
        x: 10,
        y: 128,
        width: 85,
        height: 10,
        text: "Escaneá y dejá tu reseña en Google",
        font: "source",
        fontSize: 3.6,
        fill: "#6b3a4c",
        align: "center",
      },
    ]),
  },
  {
    id: "restaurante",
    name: "Restaurante",
    business: "Mesa 12",
    description: "Colores cálidos para sala y entrada.",
    document: build("restaurante", "#fff8f1", [
      { type: "rect", role: "banda", x: 0, y: 0, width: 105, height: 12, fill: "#d97706" },
      {
        type: "text",
        role: "rubro",
        x: 10,
        y: 20,
        width: 85,
        height: 10,
        text: "Mesa 12",
        font: "fraunces",
        fontSize: 6,
        fill: "#7c2d12",
        align: "center",
      },
      {
        type: "text",
        role: "titulo",
        x: 10,
        y: 34,
        width: 85,
        height: 20,
        text: "¿Te gustó la comida?",
        font: "sora",
        fontSize: 8,
        fill: "#9a3412",
        align: "center",
      },
      {
        type: "text",
        role: "bajada",
        x: 12,
        y: 56,
        width: 81,
        height: 12,
        text: "Tu reseña nos ayuda a seguir mejorando.",
        font: "source",
        fontSize: 3.8,
        fill: "#9a3412",
        align: "center",
      },
      { type: "rect", role: "placa", x: 24, y: 72, width: 57, height: 57, fill: "#ffffff", cornerRadius: 3 },
      {
        type: "qr",
        role: "qr",
        x: 28.5,
        y: 76.5,
        width: 48,
        height: 48,
        foreground: "#7c2d12",
        background: QR_PAPER,
      },
      {
        type: "text",
        role: "ayuda",
        x: 10,
        y: 134,
        width: 85,
        height: 8,
        text: "Escaneá acá, en Google",
        font: "source",
        fontSize: 3.6,
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
    document: build("gimnasio", "#101412", [
      { type: "rect", role: "franja", x: 0, y: 0, width: 105, height: 6, fill: "#22c55e" },
      {
        type: "text",
        role: "rubro",
        x: 10,
        y: 14,
        width: 85,
        height: 8,
        text: "Forge Gym",
        font: "source",
        fontSize: 4,
        fill: "#86efac",
        align: "left",
      },
      {
        type: "text",
        role: "titulo",
        x: 10,
        y: 26,
        width: 85,
        height: 24,
        text: "Dejá tu reseña",
        font: "sora",
        fontSize: 9,
        fill: "#f0fdf4",
        align: "left",
      },
      {
        type: "text",
        role: "bajada",
        x: 10,
        y: 52,
        width: 85,
        height: 12,
        text: "Contanos tu experiencia en el gym.",
        font: "source",
        fontSize: 4,
        fill: "#bbf7d0",
        align: "left",
      },
      { type: "rect", role: "placa", x: 24, y: 70, width: 57, height: 57, fill: "#ffffff", cornerRadius: 2 },
      {
        type: "qr",
        role: "qr",
        x: 28.5,
        y: 74.5,
        width: 48,
        height: 48,
        foreground: "#052e16",
        background: QR_PAPER,
      },
      {
        type: "text",
        role: "ayuda",
        x: 10,
        y: 134,
        width: 85,
        height: 8,
        text: "Escaneá acá, en Google",
        font: "source",
        fontSize: 3.6,
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
      { type: "rect", role: "riel", x: 0, y: 0, width: 14, height: 148, fill: "#1d4ed8" },
      { type: "rect", role: "banda", x: 14, y: 0, width: 91, height: 40, fill: "#f97316" },
      {
        type: "text",
        role: "rubro",
        x: 22,
        y: 8,
        width: 76,
        height: 8,
        text: "Casa Verde",
        font: "source",
        fontSize: 3.8,
        fill: "#fff7ed",
        align: "left",
      },
      {
        type: "text",
        role: "titulo",
        x: 22,
        y: 16,
        width: 76,
        height: 18,
        text: "Tu opinión nos importa",
        font: "sora",
        fontSize: 7,
        fill: "#ffffff",
        align: "left",
      },
      {
        type: "text",
        role: "bajada",
        x: 22,
        y: 48,
        width: 76,
        height: 12,
        text: "Escaneá y contanos cómo te atendimos.",
        font: "source",
        fontSize: 3.8,
        fill: "#1e3a8a",
        align: "left",
      },
      {
        type: "qr",
        role: "qr",
        x: 30,
        y: 68,
        width: 52,
        height: 52,
        foreground: QR_INK,
        background: QR_PAPER,
      },
      {
        type: "text",
        role: "ayuda",
        x: 22,
        y: 128,
        width: 76,
        height: 10,
        text: "Escaneá acá, en Google",
        font: "source",
        fontSize: 3.6,
        fill: "#1e3a8a",
        align: "left",
      },
    ]),
  },
];
