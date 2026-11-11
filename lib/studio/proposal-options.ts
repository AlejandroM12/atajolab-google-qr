/**
 * Choices of the guided flow that both the browser and the server need.
 * Client-safe: the layout work itself lives in lib/studio/proposals.ts.
 */
import type { QrContentType } from "@/lib/qr-content";

export type StyleId = "clasico" | "vivo" | "nocturno" | "profesional";

/** The four colors a style paints a template with. */
export type StyleTone = { paper: string; ink: string; primary: string; accent: string };

export type StyleSpec = {
  id: StyleId;
  name: string;
  description: string;
  /** Two takes on the same mood, alternated between proposals. */
  tones: [StyleTone, StyleTone];
};

export const styleList: StyleSpec[] = [
  {
    id: "clasico",
    name: "Clásico",
    description: "Papel claro, tinta oscura y un toque cálido.",
    tones: [
      { paper: "#fffcf8", ink: "#1c1915", primary: "#1c1915", accent: "#a16207" },
      { paper: "#f7f1e8", ink: "#2a1f1a", primary: "#3b2a22", accent: "#9a3412" },
    ],
  },
  {
    id: "vivo",
    name: "Vivo",
    description: "Colores fuertes que se ven de lejos.",
    tones: [
      { paper: "#f3ecdf", ink: "#1c1915", primary: "#0c3b32", accent: "#ff4d00" },
      { paper: "#fff7e6", ink: "#1b1b3a", primary: "#1b1b3a", accent: "#ffb703" },
    ],
  },
  {
    id: "nocturno",
    name: "Nocturno",
    description: "Fondo oscuro y el código bien iluminado.",
    tones: [
      { paper: "#121417", ink: "#f7f4ee", primary: "#2b3038", accent: "#ffb000" },
      { paper: "#0f1b2d", ink: "#eef4ff", primary: "#22395c", accent: "#5eead4" },
    ],
  },
  {
    id: "profesional",
    name: "Profesional",
    description: "Sobrio y ordenado, para oficinas y servicios.",
    tones: [
      { paper: "#f4f0e6", ink: "#14221f", primary: "#14352f", accent: "#0f6e62" },
      { paper: "#f1f4f8", ink: "#0f1f33", primary: "#12355b", accent: "#1d6fa5" },
    ],
  },
];

export function isStyleId(value: unknown): value is StyleId {
  return typeof value === "string" && styleList.some((style) => style.id === value);
}

export function styleSpec(id: StyleId): StyleSpec {
  return styleList.find((style) => style.id === id) ?? styleList[0]!;
}

const RECOMMENDED: Record<QrContentType, StyleId> = {
  url: "profesional",
  social: "vivo",
  whatsapp: "vivo",
  maps: "profesional",
  review: "clasico",
  menu: "clasico",
  event: "nocturno",
  wifi: "profesional",
  vcard: "profesional",
  text: "clasico",
};

/** The style preselected for each kind of content. The user can pick any other. */
export function recommendedStyle(type: QrContentType): StyleId {
  return RECOMMENDED[type];
}

/** Optional business or brand name shown on the piece. */
export const PROPOSAL_NAME_MAX = 40;
