/**
 * Ready-made examples for the gallery and the home page: one per common use,
 * each built with a Studio template on a fitting format. Client-safe.
 *
 * They are normal documents made by the same engine as everything else, with
 * a sample QR that the editor asks the user to replace before ordering.
 */
import { updateElement } from "@/lib/studio/document";
import { DEMO_QR } from "@/lib/studio/demo-qr";
import { formatSpec, type FormatId } from "@/lib/studio/formats";
import { createId, type IdFactory } from "@/lib/studio/ids";
import type { StyleTone } from "@/lib/studio/proposal-options";
import { clampQrGeometry } from "@/lib/studio/qr-rules";
import { paintDocument, templateColors } from "@/lib/studio/template-colors";
import { createDocument, recenterHostedTexts } from "@/lib/studio/templates";
import { estimateFittingSize } from "@/lib/studio/text-estimate";
import type { DesignDocumentV8, TemplateId } from "@/lib/studio/types";

export type InspirationId = "instagram" | "whatsapp" | "menu" | "evento" | "wifi" | "resenas";

export type InspirationDesign = {
  id: InspirationId;
  /** What the piece is for, e.g. "Perfil de Instagram". */
  name: string;
  /** Made-up business shown on the example. */
  business: string;
  description: string;
  /** Format name shown next to the example. */
  format: string;
  document: DesignDocumentV8;
};

type Recipe = {
  id: InspirationId;
  name: string;
  business: string;
  description: string;
  templateId: TemplateId;
  formatId: FormatId;
  tone: StyleTone;
  qr: string;
  /** Text for each template role. */
  texts: Record<string, string>;
};

function idsFor(seed: string): IdFactory {
  let n = 0;
  return (prefix) => `${seed}-${prefix}-${++n}`;
}

function build(recipe: Recipe): InspirationDesign {
  let document = createDocument(recipe.templateId, idsFor(recipe.id), recipe.formatId);
  document = paintDocument(document, templateColors(recipe.templateId, recipe.tone));
  for (const element of document.elements) {
    if (element.type === "qr") {
      document = updateElement(document, element.id, { value: recipe.qr });
      continue;
    }
    if (element.type !== "text" || !element.role) continue;
    const text = recipe.texts[element.role];
    if (text === undefined) continue;
    // A margin on the estimate: the tests check the result against the real print metrics.
    const fontSize = estimateFittingSize({
      text,
      font: element.font,
      fontSize: element.fontSize,
      width: element.width * 0.9,
      height: element.height,
      floor: Math.max(2, element.fontSize * 0.55),
    });
    document = updateElement(document, element.id, { text, fontSize });
  }
  return {
    id: recipe.id,
    name: recipe.name,
    business: recipe.business,
    description: recipe.description,
    format: formatSpec(recipe.formatId).name,
    document: recenterHostedTexts(document),
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
      return clampQrGeometry({ ...element, id: idFor("qr") }, document.format);
    }),
  };
}

/** Ids of the earlier gallery (one per trade), kept so old links open a close example. */
const LEGACY_IDS: Record<string, InspirationId> = {
  taller: "resenas",
  peluqueria: "resenas",
  cafeteria: "menu",
  restaurante: "menu",
  gimnasio: "instagram",
  comercio: "whatsapp",
};

export function getInspiration(id: string | null | undefined): InspirationDesign | null {
  if (!id) return null;
  const current = LEGACY_IDS[id] ?? id;
  return inspirationDesigns.find((item) => item.id === current) ?? null;
}

export const inspirationDesigns: InspirationDesign[] = [
  build({
    id: "instagram",
    name: "Perfil de Instagram",
    business: "Verde Vivo",
    description: "Un post cuadrado para sumar seguidores desde el local o desde otras redes.",
    templateId: "vivo",
    formatId: "post",
    tone: { paper: "#f3ecdf", ink: "#1c1915", primary: "#0c3b32", accent: "#ff4d00" },
    qr: DEMO_QR.instagram,
    texts: {
      rubro: "VERDE VIVO",
      titulo: "Seguinos en Instagram",
      cta: "Escaneá y seguinos",
      ayuda: "@verdevivo.plantas",
    },
  }),
  build({
    id: "whatsapp",
    name: "Pedidos por WhatsApp",
    business: "Doña Rosa",
    description: "Un cartel de mostrador que abre el chat con el mensaje ya escrito.",
    templateId: "negocio",
    formatId: "a6",
    tone: { paper: "#f7f1e8", ink: "#1c1915", primary: "#14352f", accent: "#0f7a4d" },
    qr: DEMO_QR.whatsapp,
    texts: {
      rubro: "Doña Rosa",
      titulo: "Hacé tu pedido por WhatsApp",
      cta: "Escaneá y chateá",
      ayuda: "Pastas caseras · Lunes a sábado",
    },
  }),
  build({
    id: "menu",
    name: "Carta del restaurante",
    business: "El Farol",
    description: "Para cada mesa: la carta siempre actualizada, sin reimprimir.",
    templateId: "nocturno",
    formatId: "a6",
    tone: { paper: "#121417", ink: "#f7f4ee", primary: "#2b3038", accent: "#ffb000" },
    qr: DEMO_QR.menu,
    texts: {
      rubro: "BODEGÓN EL FAROL",
      titulo: "Mirá nuestra carta",
      cta: "Escaneá y mirá",
      ayuda: "Platos del día, vinos y postres",
    },
  }),
  build({
    id: "evento",
    name: "Invitación a un evento",
    business: "Feria de Diseño",
    description: "Una historia para compartir con la fecha y el acceso a las entradas.",
    templateId: "creativo",
    formatId: "historia",
    tone: { paper: "#f4f0e6", ink: "#1c1915", primary: "#2a1a4a", accent: "#ffb703" },
    qr: DEMO_QR.evento,
    texts: {
      rubro: "FERIA DE DISEÑO",
      titulo: "Te esperamos el sábado",
      bajada: "12 de abril · Galpón Central",
      cta: "Escaneá y sumate",
      ayuda: "Entrada libre",
    },
  }),
  build({
    id: "wifi",
    name: "Wi-Fi para clientes",
    business: "Café Lumen",
    description: "Una etiqueta para la mesa o la caja: se conectan sin pedir la contraseña.",
    templateId: "corporativo",
    formatId: "etiqueta",
    tone: { paper: "#f1f4f8", ink: "#0f1f33", primary: "#12355b", accent: "#1d6fa5" },
    qr: DEMO_QR.wifi,
    texts: {
      rubro: "CAFÉ LUMEN",
      titulo: "Wi-Fi gratis",
      bajada: "Sin escribir la contraseña.",
      cta: "Escaneá y conectate",
      ayuda: "Abrí la cámara y apuntá al código.",
    },
  }),
  build({
    id: "resenas",
    name: "Reseñas de Google",
    business: "Estudio Aura",
    description: "El clásico de la caja: un escaneo y dejan su opinión.",
    templateId: "clasico",
    formatId: "a6",
    tone: { paper: "#fffcf8", ink: "#1c1915", primary: "#1c1915", accent: "#a16207" },
    qr: DEMO_QR.resenas,
    texts: {
      rubro: "ESTUDIO AURA",
      titulo: "Tu opinión nos importa",
      cta: "ESCANEÁ Y OPINÁ",
      ayuda: "Dejanos tu reseña en Google",
    },
  }),
];
