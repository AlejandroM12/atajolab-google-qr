/**
 * How a style tone (paper, ink, primary, accent) paints each template.
 * Client-safe. Used for the templates' own suggested colors, the guided
 * proposals and the inspiration gallery, so the three always agree.
 */
import { contrastRatio, isDarkColor, mixColors } from "@/lib/color";
import type { StyleTone } from "@/lib/studio/proposal-options";
import type { DesignDocumentV8, TemplateId } from "@/lib/studio/types";

export type TemplateColors = { background: string; fills: Record<string, string> };

const WHITE = "#ffffff";
const INK = "#1c1915";

/** White or dark ink, whichever reads better on the given color. */
export function inkOn(background: string): string {
  return contrastRatio(WHITE, background) >= contrastRatio(INK, background) ? WHITE : INK;
}

/** The wanted color when it reads well as text on the background, otherwise the fallback. */
function textColor(wanted: string, background: string, fallback: string): string {
  return contrastRatio(wanted, background) >= 4.5 ? wanted : fallback;
}

/** The tone each template was designed with. */
export const templateTones: Record<TemplateId, StyleTone> = {
  clasico: { paper: "#fffcf8", ink: "#1c1915", primary: "#1c1915", accent: "#a16207" },
  vivo: { paper: "#f3ecdf", ink: "#1c1915", primary: "#0c3b32", accent: "#ff4d00" },
  nocturno: { paper: "#121417", ink: "#f7f4ee", primary: "#2b3038", accent: "#ffb000" },
  negocio: { paper: "#f7f1e8", ink: "#1c1915", primary: "#1c1915", accent: "#c2410c" },
  corporativo: { paper: "#f4f0e6", ink: "#14221f", primary: "#14352f", accent: "#0f6e62" },
  creativo: { paper: "#f4f0e6", ink: "#1c1915", primary: "#0b5348", accent: "#ff4d00" },
};

/** Background and role colors of a template painted with a tone. */
export function templateColors(templateId: TemplateId, tone: StyleTone): TemplateColors {
  const darkPaper = isDarkColor(tone.paper);
  // A solid shape needs to stand out from the paper; fall back to the accent when it does not.
  const solid = contrastRatio(tone.primary, tone.paper) >= 1.6 ? tone.primary : tone.accent;

  if (templateId === "clasico") {
    return {
      background: tone.paper,
      fills: {
        "linea-sup": tone.ink,
        "linea-inf": tone.ink,
        "linea-izq": tone.ink,
        "linea-der": tone.ink,
        rubro: textColor(tone.accent, tone.paper, tone.ink),
        titulo: tone.ink,
        "regla-izq": tone.ink,
        rombo: tone.accent,
        "regla-der": tone.ink,
        marco: tone.ink,
        cta: textColor(tone.accent, tone.paper, tone.ink),
        ayuda: tone.ink,
      },
    };
  }

  if (templateId === "vivo") {
    return {
      background: tone.paper,
      fills: {
        banda: tone.accent,
        circulo: tone.primary,
        punto: tone.paper,
        rubro: inkOn(tone.accent),
        titulo: inkOn(tone.accent),
        placa: WHITE,
        pildora: solid,
        cta: inkOn(solid),
        ayuda: tone.ink,
      },
    };
  }

  if (templateId === "nocturno") {
    const background = darkPaper ? tone.paper : tone.primary;
    const text = inkOn(background);
    return {
      background,
      fills: {
        barra: tone.accent,
        rubro: textColor(tone.accent, background, text),
        titulo: text,
        brillo: tone.accent,
        placa: WHITE,
        cta: textColor(tone.accent, background, text),
        ayuda: text,
      },
    };
  }

  if (templateId === "negocio") {
    return {
      background: tone.paper,
      fills: {
        rubro: tone.ink,
        acento: tone.accent,
        titulo: tone.ink,
        sello: solid,
        placa: WHITE,
        cta: textColor(tone.accent, tone.paper, tone.ink),
        ayuda: tone.ink,
      },
    };
  }

  if (templateId === "corporativo") {
    return {
      background: tone.paper,
      fills: {
        banda: solid,
        rubro: inkOn(solid),
        titulo: tone.ink,
        acento: tone.accent,
        bajada: tone.ink,
        panel: mixColors(tone.paper, tone.ink, 0.09),
        placa: WHITE,
        cta: tone.ink,
        ayuda: tone.ink,
      },
    };
  }

  const background = darkPaper ? tone.paper : tone.primary;
  const sticker = contrastRatio(tone.accent, background) >= 2.2 ? tone.accent : "#f4f0e6";
  const text = inkOn(background);
  return {
    background,
    fills: {
      rubro: text,
      mancha: sticker,
      titulo: inkOn(sticker),
      bajada: text,
      sombra: mixColors(background, "#000000", 0.5),
      placa: WHITE,
      cta: text,
      ayuda: text,
      "punto-a": sticker,
      "punto-b": sticker,
      "punto-c": sticker,
    },
  };
}

/** Paints background and template pieces. The QR and images keep their own colors. */
export function paintDocument(document: DesignDocumentV8, colors: TemplateColors): DesignDocumentV8 {
  const paint = <T extends DesignDocumentV8["elements"][number]>(element: T): T => {
    const fill = element.role ? colors.fills[element.role] : undefined;
    if (!fill || element.type === "qr" || element.type === "image") return element;
    return { ...element, fill };
  };
  return {
    ...document,
    background: colors.background,
    elements: document.elements.map(paint),
    parked: document.parked.map(paint),
  };
}
