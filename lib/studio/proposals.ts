/**
 * Design proposals for the guided flow. Server-side: text is fitted with the
 * real font metrics used by the export.
 *
 * Everything is decided by fixed rules (content type → wording and template
 * order, style → colors, format → composition). The same input always gives
 * the same proposals, and each one is a normal Studio document the editor can
 * change completely.
 */
import { contrastRatio, isDarkColor } from "@/lib/color";
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
import {
  PROPOSAL_NAME_MAX,
  styleSpec,
  type StyleId,
  type StyleTone,
} from "@/lib/studio/proposal-options";
import { createDocument, templateList } from "@/lib/studio/templates";
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
  helps: [string, string];
  /** One supporting sentence. */
  sub: string;
};

const TEMPLATE_ORDER: Record<QrContentType, TemplateId[]> = {
  review: ["clasico", "negocio", "nocturno", "vivo", "corporativo", "creativo"],
  maps: ["corporativo", "clasico", "vivo", "negocio", "nocturno", "creativo"],
  url: ["creativo", "corporativo", "vivo", "clasico", "negocio", "nocturno"],
  social: ["creativo", "vivo", "nocturno", "negocio", "clasico", "corporativo"],
  whatsapp: ["vivo", "negocio", "creativo", "clasico", "corporativo", "nocturno"],
  menu: ["clasico", "nocturno", "vivo", "negocio", "creativo", "corporativo"],
  event: ["creativo", "nocturno", "vivo", "clasico", "negocio", "corporativo"],
  wifi: ["corporativo", "negocio", "clasico", "vivo", "nocturno", "creativo"],
  vcard: ["corporativo", "clasico", "negocio", "nocturno", "vivo", "creativo"],
  text: ["clasico", "creativo", "corporativo", "vivo", "negocio", "nocturno"],
};

function copyFor(content: QrContentInput): Copy {
  switch (content.type) {
    case "review":
      return {
        kicker: "Reseñas",
        titles: ["Tu opinión nos importa", "Dejanos tu reseña", "¿Te gustó? Contalo en Google"],
        helps: ["Escaneá y dejanos tu reseña en Google", "Escaneá acá, en Google"],
        sub: "Tu reseña nos ayuda a crecer.",
      };
    case "maps":
      return {
        kicker: "Cómo llegar",
        titles: ["Encontranos en Google Maps", "Te esperamos", "Llegá sin vueltas"],
        helps: ["Escaneá y abrí la ubicación", "Escaneá para ver el mapa"],
        sub: "Abrí el mapa y seguí el camino.",
      };
    case "social": {
      const network = socialNetworkName(content.network);
      return {
        kicker: content.network === "otra" ? "Redes" : network,
        titles: [`Seguinos en ${network}`, `Estamos en ${network}`, "Sumate a la comunidad"],
        helps: ["Escaneá y seguinos", "Escaneá para ver el perfil"],
        sub: "Novedades, fotos y promos.",
      };
    }
    case "whatsapp":
      return {
        kicker: "WhatsApp",
        titles: ["Escribinos por WhatsApp", "Hablemos por WhatsApp", "Pedidos y consultas"],
        helps: ["Escaneá y chateá con nosotros", "Escaneá para abrir el chat"],
        sub: "Te respondemos por chat.",
      };
    case "menu":
      return content.kind === "catalogo"
        ? {
            kicker: "Catálogo",
            titles: ["Mirá nuestro catálogo", "Catálogo digital", "Conocé nuestros productos"],
            helps: ["Escaneá para ver el catálogo", "Escaneá y mirá los productos"],
            sub: "Productos y precios al día.",
          }
        : {
            kicker: "Menú",
            titles: ["Mirá nuestra carta", "Menú digital", "Elegí lo que más te guste"],
            helps: ["Escaneá para ver el menú", "Escaneá y mirá la carta"],
            sub: "Carta siempre actualizada.",
          };
    case "event":
      return {
        kicker: "Evento",
        titles: ["Te esperamos", "Sumate al evento", "Reservá tu lugar"],
        helps: ["Escaneá para ver los detalles", "Escaneá y anotate"],
        sub: "Fecha, lugar y entradas.",
      };
    case "wifi":
      return {
        kicker: "Wi-Fi",
        titles: ["Wi-Fi gratis", "Conectate al Wi-Fi", "Wi-Fi para clientes"],
        helps: ["Escaneá para conectarte", "Escaneá con la cámara y conectate"],
        sub: "Sin escribir la contraseña.",
      };
    case "vcard":
      return {
        kicker: "Contacto",
        titles: ["Guardá mi contacto", "Agendame", "Sigamos en contacto"],
        helps: ["Escaneá para guardar el contacto", "Escaneá y agendame"],
        sub: "Mis datos, en tu agenda.",
      };
    case "text":
      return {
        kicker: "Mensaje",
        titles: ["Escaneá el código", "Tenemos un mensaje para vos", "Leé el mensaje"],
        helps: ["Escaneá con la cámara de tu celular", "Escaneá para leerlo"],
        sub: "Un mensaje pensado para vos.",
      };
    default:
      return {
        kicker: "Sitio web",
        titles: ["Visitá nuestro sitio", "Conocé más", "Todo en un escaneo"],
        helps: ["Escaneá el código con tu cámara", "Escaneá para entrar"],
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
  let kicker = name || copy.kicker;
  const help = copy.helps[index % copy.helps.length]!;

  if (content.type === "vcard") {
    // A contact card is about the person: their name is the headline.
    const person = content.name.replace(/\s+/g, " ").trim();
    const org = content.org.replace(/\s+/g, " ").trim();
    kicker = org || copy.kicker;
    if (index % 2 === 0) title = person;
    else if (!org) kicker = person;
  }

  if (templateId === "vivo") {
    return { titulo: title, ayuda: name ? `${help}\n${name}` : help };
  }
  if (templateId === "creativo") {
    return { titulo: title, bajada: help, ayuda: name || detail || copy.sub };
  }
  if (templateId === "corporativo") {
    return { rubro: kicker, titulo: title, bajada: detail && detail !== kicker ? `${copy.sub}\n${detail}` : copy.sub, ayuda: help };
  }
  return { rubro: kicker, titulo: title, ayuda: help };
}

const WHITE = "#ffffff";
const INK = "#1c1915";
const SOFT_PAPER = "#f4f0e6";

function on(background: string): string {
  return contrastRatio(WHITE, background) >= contrastRatio(INK, background) ? WHITE : INK;
}

/** Background and role colors of a template painted with a style tone. */
export function proposalColors(
  templateId: TemplateId,
  tone: StyleTone,
): { background: string; fills: Record<string, string> } {
  const darkPaper = isDarkColor(tone.paper);
  // A band needs to stand out from the paper; fall back to the accent when it does not.
  const band = contrastRatio(tone.primary, tone.paper) >= 1.6 ? tone.primary : tone.accent;

  if (templateId === "clasico") {
    return {
      background: tone.paper,
      fills: { rubro: tone.ink, titulo: tone.ink, ayuda: tone.ink, marco: tone.ink, acento: tone.accent },
    };
  }
  if (templateId === "vivo") {
    return {
      background: tone.paper,
      fills: { riel: tone.primary, banda: tone.accent, titulo: on(tone.accent), placa: WHITE, ayuda: tone.ink },
    };
  }
  if (templateId === "nocturno") {
    const background = darkPaper ? tone.paper : tone.primary;
    const text = on(background);
    return { background, fills: { franja: tone.accent, rubro: text, titulo: text, placa: WHITE, ayuda: text } };
  }
  if (templateId === "negocio") {
    return {
      background: tone.paper,
      fills: { rubro: tone.ink, banda: band, titulo: on(band), ayuda: on(band) },
    };
  }
  if (templateId === "corporativo") {
    return {
      background: tone.paper,
      fills: {
        banda: band,
        rubro: on(band),
        titulo: tone.ink,
        bajada: tone.ink,
        ayuda: tone.ink,
        acento: tone.accent,
      },
    };
  }
  const background = darkPaper ? tone.paper : tone.primary;
  const blob = contrastRatio(tone.accent, background) >= 2.2 ? tone.accent : SOFT_PAPER;
  const text = on(background);
  return { background, fills: { mancha: blob, titulo: on(blob), bajada: text, ayuda: text, acento: tone.accent } };
}

function paint(document: DesignDocumentV8, colors: { background: string; fills: Record<string, string> }): DesignDocumentV8 {
  return {
    ...document,
    background: colors.background,
    elements: document.elements.map((element) => {
      const fill = element.role ? colors.fills[element.role] : undefined;
      if (!fill || element.type === "qr" || element.type === "image") return element;
      return { ...element, fill };
    }),
  };
}

/** Share of the box width a line may use, so browser metrics never add a line the export did not. */
const FIT_WIDTH = 0.96;
/** Smallest size relative to the template's own, before a proposal is dropped as unreadable. */
const FIT_FLOOR = 0.55;

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
  document = paint(document, proposalColors(templateId, style.tones[index % style.tones.length]!));

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
