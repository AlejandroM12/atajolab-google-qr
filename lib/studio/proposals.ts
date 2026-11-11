/**
 * Design proposals for the guided flow. Server-side: text is fitted with the
 * real font metrics used by the export.
 *
 * Everything is decided by fixed rules (content type → wording and template
 * order, style → colors, format → composition). The same input always gives
 * the same proposals, and each one is a normal Studio document the editor can
 * change completely.
 */
import { measureText } from "@/lib/print/fonts";
import {
  buildQrContent,
  socialNetworkName,
  type QrContentInput,
  type QrContentType,
} from "@/lib/qr-content";
import { updateElement } from "@/lib/studio/document";
import { studioFontRole } from "@/lib/studio/export/fonts";
import { validateForExport } from "@/lib/studio/export/validate";
import { wrapStudioText } from "@/lib/studio/export/wrap";
import { formatSpec, type FormatId } from "@/lib/studio/formats";
import { createId, type IdFactory } from "@/lib/studio/ids";
import { PROPOSAL_NAME_MAX, styleSpec, type StyleId } from "@/lib/studio/proposal-options";
import { paintDocument, templateColors } from "@/lib/studio/template-colors";
import { createDocument, recenterHostedTexts, templateList } from "@/lib/studio/templates";
import type { DesignDocumentV8, TemplateId, TextElement } from "@/lib/studio/types";

export type ProposalRequest = {
  content: QrContentInput;
  /** Business or brand name. Empty when the user skipped it. */
  name: string;
  styleId: StyleId;
  formatId: FormatId;
};

export type Proposal = {
  id: string;
  templateId: TemplateId;
  /** Name of the composition, e.g. "Clásico". */
  name: string;
  document: DesignDocumentV8;
};

export type ProposalResult =
  | { ok: true; proposals: Proposal[] }
  | { ok: false; field: string; message: string };

type Copy = {
  /** Short label used where a business name would go. */
  kicker: string;
  titles: [string, string, string];
  /** The action, short enough for a button. */
  cta: string;
  /** One supporting sentence. */
  sub: string;
};

/** Shown where there is no better detail to give (a handle, a network name, a site). */
const HOW_TO = "Abrí la cámara de tu celular y apuntá al código.";

const TEMPLATE_ORDER: Record<QrContentType, TemplateId[]> = {
  review: ["clasico", "negocio", "nocturno", "vivo", "corporativo", "creativo"],
  maps: ["corporativo", "clasico", "vivo", "negocio", "nocturno", "creativo"],
  url: ["creativo", "corporativo", "vivo", "clasico", "negocio", "nocturno"],
  social: ["vivo", "creativo", "nocturno", "negocio", "clasico", "corporativo"],
  whatsapp: ["negocio", "vivo", "creativo", "clasico", "corporativo", "nocturno"],
  menu: ["nocturno", "clasico", "vivo", "negocio", "creativo", "corporativo"],
  event: ["creativo", "nocturno", "vivo", "clasico", "negocio", "corporativo"],
  wifi: ["corporativo", "negocio", "clasico", "vivo", "nocturno", "creativo"],
  vcard: ["corporativo", "clasico", "negocio", "nocturno", "vivo", "creativo"],
  text: ["clasico", "creativo", "corporativo", "vivo", "negocio", "nocturno"],
};

/** Templates where the name line is a small label, set in capitals. */
const SMALL_CAPS_NAME = new Set<TemplateId>(["clasico", "vivo", "nocturno", "corporativo", "creativo"]);

function copyFor(content: QrContentInput): Copy {
  switch (content.type) {
    case "review":
      return {
        kicker: "Reseñas",
        titles: ["Tu opinión nos importa", "Dejanos tu reseña", "¿Te gustó? Contalo en Google"],
        cta: "Escaneá y opiná",
        sub: "Tu reseña en Google nos ayuda a crecer.",
      };
    case "maps":
      return {
        kicker: "Cómo llegar",
        titles: ["Encontranos en Google Maps", "Te esperamos", "Llegá sin vueltas"],
        cta: "Escaneá y llegá",
        sub: "Abrí el mapa y seguí el camino.",
      };
    case "social": {
      const network = socialNetworkName(content.network);
      return {
        kicker: content.network === "otra" ? "Redes" : network,
        titles: [`Seguinos en ${network}`, `Estamos en ${network}`, "Sumate a la comunidad"],
        cta: "Escaneá y seguinos",
        sub: "Novedades, fotos y promos.",
      };
    }
    case "whatsapp":
      return {
        kicker: "WhatsApp",
        titles: ["Escribinos por WhatsApp", "Hablemos por WhatsApp", "Pedidos y consultas"],
        cta: "Escaneá y chateá",
        sub: "Te respondemos por chat.",
      };
    case "menu":
      return content.kind === "catalogo"
        ? {
            kicker: "Catálogo",
            titles: ["Mirá nuestro catálogo", "Catálogo digital", "Conocé nuestros productos"],
            cta: "Escaneá y mirá",
            sub: "Productos y precios al día.",
          }
        : {
            kicker: "Menú",
            titles: ["Mirá nuestra carta", "Menú digital", "Elegí lo que más te guste"],
            cta: "Escaneá y mirá",
            sub: "Carta siempre actualizada.",
          };
    case "event":
      return {
        kicker: "Evento",
        titles: ["Te esperamos", "Sumate al evento", "Reservá tu lugar"],
        cta: "Escaneá y sumate",
        sub: "Fecha, lugar y entradas.",
      };
    case "wifi":
      return {
        kicker: "Wi-Fi",
        titles: ["Wi-Fi gratis", "Conectate al Wi-Fi", "Wi-Fi para clientes"],
        cta: "Escaneá y conectate",
        sub: "Sin escribir la contraseña.",
      };
    case "vcard":
      return {
        kicker: "Contacto",
        titles: ["Guardá mi contacto", "Agendame", "Sigamos en contacto"],
        cta: "Escaneá y agendame",
        sub: "Mis datos, directo a tu agenda.",
      };
    case "text":
      return {
        kicker: "Mensaje",
        titles: ["Tenemos un mensaje para vos", "Escaneá el código", "Leé el mensaje"],
        cta: "Escaneá acá",
        sub: "Un mensaje pensado para vos.",
      };
    default:
      return {
        kicker: "Sitio web",
        titles: ["Visitá nuestro sitio", "Conocé más", "Todo en un escaneo"],
        cta: "Escaneá y entrá",
        sub: "Toda la información en un lugar.",
      };
  }
}

/** Texts for each role of a template. Roles a template does not have are ignored. */
function textsFor(
  templateId: TemplateId,
  content: QrContentInput,
  name: string,
  detail: string,
  index: number,
): Record<string, string> {
  const copy = copyFor(content);
  let title = copy.titles[index % copy.titles.length]!;
  let label = name || copy.kicker;

  if (content.type === "vcard") {
    // A contact card is about the person: their name is the headline.
    const person = content.name.replace(/\s+/g, " ").trim();
    const org = content.org.replace(/\s+/g, " ").trim();
    label = org || copy.kicker;
    if (index % 2 === 0) title = person;
    else if (!org) label = person;
  }

  const rubro = SMALL_CAPS_NAME.has(templateId) ? label.toLocaleUpperCase("es") : label;
  const cta = templateId === "clasico" ? copy.cta.toLocaleUpperCase("es") : copy.cta;

  if (templateId === "corporativo") {
    return { rubro, titulo: title, bajada: detail ? `${copy.sub}\n${detail}` : copy.sub, cta, ayuda: HOW_TO };
  }
  if (templateId === "creativo") {
    return { rubro, titulo: title, bajada: copy.sub, cta, ayuda: detail || HOW_TO };
  }
  return { rubro, titulo: title, cta, ayuda: detail || copy.sub };
}

/** Share of the box width a line may use, so browser metrics never add a line the export did not. */
const FIT_WIDTH = 0.96;
/** Smallest size relative to the template's own, before a proposal is dropped as unreadable. */
const FIT_FLOOR = 0.5;

/** Largest size at which the text fits its box with the real font. Null when it cannot fit. */
export function fittedFontSize(element: TextElement): number | null {
  const width = element.width * FIT_WIDTH;
  const role = studioFontRole(element.font);
  const floor = Math.max(2, element.fontSize * FIT_FLOOR);
  for (let size = element.fontSize; size >= floor - 0.001; size -= 0.1) {
    const fontSize = Math.round(size * 10) / 10;
    const wrapped = wrapStudioText({ text: element.text, font: element.font, fontSize, width });
    if (wrapped.lines.length * wrapped.lineHeight > element.height) continue;
    if (wrapped.lines.some((line) => measureText(role, fontSize, line) > width)) continue;
    return fontSize;
  }
  return null;
}

function buildOne(input: {
  templateId: TemplateId;
  request: ProposalRequest;
  value: string;
  detail: string;
  name: string;
  index: number;
  idFor: IdFactory;
}): DesignDocumentV8 | null {
  const { templateId, request, index } = input;
  let document = createDocument(templateId, input.idFor, request.formatId);
  const texts = textsFor(templateId, request.content, input.name, input.detail, index);
  const style = styleSpec(request.styleId);
  document = paintDocument(document, templateColors(templateId, style.tones[index % style.tones.length]!));

  for (const element of document.elements) {
    if (element.type === "qr") {
      document = updateElement(document, element.id, { value: input.value });
      continue;
    }
    if (element.type !== "text" || !element.role) continue;
    const text = texts[element.role];
    if (text === undefined) continue;
    const fontSize = fittedFontSize({ ...element, text });
    if (fontSize === null) return null;
    document = updateElement(document, element.id, { text, fontSize });
  }
  // Button labels may have shrunk: keep them in the middle of their button.
  document = recenterHostedTexts(document);

  return validateForExport(document, { commercial: true }).ready ? document : null;
}

export function cleanProposalName(raw: string): string {
  return raw.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, PROPOSAL_NAME_MAX);
}

/**
 * Up to six proposals, best match first. Compositions that cannot show the
 * content well on the chosen format (text too long, code too dense) are left out.
 */
export function buildProposals(request: ProposalRequest, idFor: IdFactory = createId): ProposalResult {
  const content = buildQrContent(request.content);
  if (!content.ok) return content;
  const name = request.content.type === "vcard" ? "" : cleanProposalName(request.name);

  const proposals: Proposal[] = [];
  TEMPLATE_ORDER[request.content.type].forEach((templateId, index) => {
    const document = buildOne({
      templateId,
      request,
      value: content.value,
      detail: content.detail,
      name,
      index,
      idFor,
    });
    if (!document) return;
    proposals.push({
      id: `${request.formatId}-${request.styleId}-${templateId}`,
      templateId,
      name: templateList.find((template) => template.id === templateId)?.name ?? templateId,
      document,
    });
  });

  if (proposals.length === 0) {
    return {
      ok: false,
      field: "format",
      message: `Ese contenido es muy largo para ${formatSpec(request.formatId).name}. Elegí un formato más grande o acortá el contenido.`,
    };
  }
  return { ok: true, proposals };
}
