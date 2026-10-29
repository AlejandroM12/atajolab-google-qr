import type { GoogleLinkGoal } from "@/lib/google-link";
import type { QrSize } from "@/lib/product";

export const ARTWORK_VERSION = 1 as const;
export const STUDIO_ARTWORK_VERSION = 2 as const;
export const COMMERCIAL_ARTWORK_VERSION = 3 as const;
/** Counter cards. Version 3 stays frozen so stored orders keep their original drawing. */
export const COUNTER_ARTWORK_VERSION = 4 as const;
/** Review posters and stickers. Versions 1–4 keep their own renderers. */
export const SIGNAGE_ARTWORK_VERSION = 5 as const;
/**
 * Refined press layouts. Version 5 keeps layoutSignage.
 * A redesign of this drawing needs a new artwork version. Do not change layoutPress in place.
 */
export const PRESS_ARTWORK_VERSION = 6 as const;

export const BUSINESS_NAME_MAX = 42;
export const HEADLINE_MAX = 72;
export const SUBTITLE_MAX = 90;

export const artworkExportFormats = ["png", "svg", "pdf"] as const;

export type ArtworkExportFormat = (typeof artworkExportFormats)[number];

export type LegacyTemplateId = "tarjeta-resena" | "cartel-ubicacion" | "sticker";

export type StudioTemplateId = "minimal-elegance" | "dark-premium" | "brand-identity";

export type CommercialTemplateId = "minimal-elegant" | "dark-premium" | "modern-business" | "creative-pop";

export type CounterTemplateId = "google-clean" | "black-modern" | "brand-pro" | "bold-review";

export type SignageTemplateId = "review-clean" | "review-dark" | "review-brand";

export type SignageObjective = "review" | "location";

export type SignageFormat = "poster" | "sticker";

export type ArtworkTemplateId =
  | LegacyTemplateId
  | StudioTemplateId
  | CommercialTemplateId
  | CounterTemplateId
  | SignageTemplateId;

export type ArtworkFontId = "sora" | "source" | "fraunces";

export type ArtworkLogo = {
  mime: "image/png";
  width: number;
  height: number;
  data: string;
};

export type ArtworkTemplateSpec = {
  id: ArtworkTemplateId;
  name: string;
  description: string;
  widthMm: number;
  heightMm: number;
};

export type StudioTemplateSpec = Omit<ArtworkTemplateSpec, "id"> & {
  id: StudioTemplateId;
};

export type CommercialTemplateSpec = Omit<ArtworkTemplateSpec, "id"> & {
  id: CommercialTemplateId;
};

export type CounterTemplateSpec = Omit<ArtworkTemplateSpec, "id"> & {
  id: CounterTemplateId;
};

export type SignageTemplateSpec = Omit<ArtworkTemplateSpec, "id"> & {
  id: SignageTemplateId;
};

export type SignageFormatSpec = {
  id: SignageFormat;
  name: string;
  description: string;
  widthMm: number;
  heightMm: number;
};

export const artworkTemplates: readonly ArtworkTemplateSpec[] = [
  {
    id: "tarjeta-resena",
    name: "Tarjeta para reseñas",
    description: "Para el mostrador. La persona escanea y abre el formulario de reseña.",
    widthMm: 90,
    heightMm: 140,
  },
  {
    id: "cartel-ubicacion",
    name: "Cartel de ubicación",
    description: "Para la puerta o la vidriera. El QR abre la ubicación en el mapa.",
    widthMm: 105,
    heightMm: 148,
  },
  {
    id: "sticker",
    name: "Sticker QR",
    description: "Formato chico, para pegar en un producto, una caja o un empaque.",
    widthMm: 70,
    heightMm: 70,
  },
];

export const studioTemplates: readonly StudioTemplateSpec[] = [
  {
    id: "minimal-elegance",
    name: "Minimal Elegance",
    description: "Tarjeta clara, con aire, filete fino y el QR en el centro.",
    widthMm: 90,
    heightMm: 140,
  },
  {
    id: "dark-premium",
    name: "Dark Premium",
    description: "Cartel oscuro, acento metálico y el QR sobre un panel claro.",
    widthMm: 105,
    heightMm: 148,
  },
  {
    id: "brand-identity",
    name: "Brand Identity",
    description: "Banda de marca con el logo y el QR en una zona aparte.",
    widthMm: 100,
    heightMm: 150,
  },
];

export const commercialTemplates: readonly CommercialTemplateSpec[] = [
  {
    id: "minimal-elegant",
    name: "Minimal Elegant",
    description: "Tarjeta centrada, filete doble y el QR en un recuadro tranquilo.",
    widthMm: 90,
    heightMm: 140,
  },
  {
    id: "dark-premium",
    name: "Dark Premium",
    description: "Cartel con marco, marcas de esquina y el QR sobre una placa clara.",
    widthMm: 105,
    heightMm: 148,
  },
  {
    id: "modern-business",
    name: "Modern Business",
    description: "Columna de marca, título a la izquierda y el QR junto a la indicación.",
    widthMm: 100,
    heightMm: 148,
  },
  {
    id: "creative-pop",
    name: "Creative Pop",
    description: "Título arriba, el QR como sticker y formas de color abajo.",
    widthMm: 90,
    heightMm: 140,
  },
];

export const counterTemplates: readonly CounterTemplateSpec[] = [
  {
    id: "google-clean",
    name: "Google Clean",
    description: "Fondo claro, el nombre completo y la frase en tipografía. El QR es el protagonista.",
    widthMm: 90,
    heightMm: 140,
  },
  {
    id: "black-modern",
    name: "Black Modern",
    description: "Pieza oscura y directa, con el QR en un bloque claro.",
    widthMm: 90,
    heightMm: 140,
  },
  {
    id: "brand-pro",
    name: "Brand Pro",
    description: "Prioriza el logo del negocio. Sin logo, quedan el nombre y el color.",
    widthMm: 100,
    heightMm: 148,
  },
  {
    id: "bold-review",
    name: "Bold Review",
    description: "Encabezado corto con el nombre y la frase equilibrados. El QR ocupa el resto.",
    widthMm: 90,
    heightMm: 140,
  },
];

/**
 * Poster is A6 (105 × 148 mm): a counter and wall size, close to a 4×6 in review stand.
 * Sticker is 80 × 80 mm: enough for a scannable QR and type that stays readable when printed small.
 */
export const signageFormats: readonly SignageFormatSpec[] = [
  {
    id: "poster",
    name: "Cartel",
    description: "A6 vertical, 105 × 148 mm. Para mostrador, pared o soporte.",
    widthMm: 105,
    heightMm: 148,
  },
  {
    id: "sticker",
    name: "Sticker",
    description: "Cuadrado de 80 × 80 mm, con margen para recortar y pegar.",
    widthMm: 80,
    heightMm: 80,
  },
];

export const signageTemplates: readonly SignageTemplateSpec[] = [
  {
    id: "review-clean",
    name: "Review Clean",
    description: "Centrado y con aire. El pedido va arriba y el QR ocupa la mitad inferior.",
    widthMm: 105,
    heightMm: 148,
  },
  {
    id: "review-dark",
    name: "Review Dark",
    description: "Campo oscuro, el texto arriba y el QR blanco como protagonista.",
    widthMm: 105,
    heightMm: 148,
  },
  {
    id: "review-brand",
    name: "Review Brand",
    description: "Membrete con el logo y el nombre. Sin logo, no deja un recuadro vacío.",
    widthMm: 105,
    heightMm: 148,
  },
];

export const signageCopy: Record<SignageObjective, { message: string; instruction: string }> = {
  review: {
    message: "Dejanos tu reseña en Google",
    instruction: "Escaneá el QR con tu celular",
  },
  location: {
    message: "Encontranos en Google Maps",
    instruction: "Escaneá el QR con tu celular",
  },
};

/** Frozen copy for version 6. Version 5 keeps reading signageCopy. */
export const pressCopy: Record<SignageObjective, { message: string; instruction: string }> = {
  review: {
    message: "Dejanos tu reseña en Google",
    instruction: "Escaneá el QR con tu celular",
  },
  location: {
    message: "Encontranos en Google Maps",
    instruction: "Escaneá el QR con tu celular",
  },
};

export const phraseLibrary: Record<GoogleLinkGoal, readonly string[]> = {
  ubicacion: [
    "Escaneá para ver cómo llegar",
    "Encontranos en Google Maps",
    "Abrí el mapa desde acá",
    "Te esperamos en el local",
    "Mirá la ubicación y vení",
  ],
  resena: [
    "Escaneá y contanos tu experiencia",
    "Dejanos tu reseña en Google",
    "Tu opinión nos ayuda a mejorar",
    "Contanos cómo te atendimos",
    "Un minuto para tu reseña",
  ],
};

export const headlineSuggestions = phraseLibrary;

export const artworkFonts: readonly { id: ArtworkFontId; name: string; detail: string }[] = [
  { id: "fraunces", name: "Fraunces", detail: "Serif editorial" },
  { id: "sora", name: "Sora", detail: "Geométrica" },
  { id: "source", name: "Source Sans", detail: "Humanista" },
];

/**
 * Shared by the on-screen preview and by the PNG, SVG and PDF exporters.
 * This object describes the piece. It does not create a file.
 */
export type ProductArtworkV1 = {
  version: typeof ARTWORK_VERSION;
  templateId: LegacyTemplateId;
  goal: GoogleLinkGoal;
  businessName: string;
  headline: string;
  foreground: string;
  background: string;
  qrSize: QrSize;
  href: string | null;
};

export type ProductArtworkV2 = {
  version: typeof STUDIO_ARTWORK_VERSION;
  templateId: StudioTemplateId;
  goal: GoogleLinkGoal;
  businessName: string;
  subtitle: string;
  fontId: ArtworkFontId;
  ink: string;
  accent: string;
  surface: string;
  foreground: string;
  background: string;
  qrSize: QrSize;
  href: string | null;
  logo: ArtworkLogo | null;
  serviceLine: "Google Maps" | "Reseña en Google";
  nfc: false;
};

export type ProductArtworkV3 = {
  version: typeof COMMERCIAL_ARTWORK_VERSION;
  templateId: CommercialTemplateId;
  goal: GoogleLinkGoal;
  businessName: string;
  subtitle: string;
  fontId: ArtworkFontId;
  ink: string;
  accent: string;
  surface: string;
  foreground: string;
  background: string;
  qrSize: QrSize;
  href: string | null;
  logo: ArtworkLogo | null;
  serviceLine: "Google Maps" | "Reseña en Google";
  nfc: false;
};

export type ProductArtworkV4 = {
  version: typeof COUNTER_ARTWORK_VERSION;
  templateId: CounterTemplateId;
  goal: GoogleLinkGoal;
  businessName: string;
  subtitle: string;
  fontId: ArtworkFontId;
  ink: string;
  accent: string;
  surface: string;
  foreground: string;
  background: string;
  qrSize: QrSize;
  href: string | null;
  logo: ArtworkLogo | null;
  serviceLine: "Google Maps" | "Reseña en Google";
  nfc: false;
};

export type ProductArtworkV5 = {
  version: typeof SIGNAGE_ARTWORK_VERSION;
  objective: SignageObjective;
  format: SignageFormat;
  templateId: SignageTemplateId;
  businessName: string;
  message: string;
  instruction: string;
  fontId: ArtworkFontId;
  ink: string;
  accent: string;
  surface: string;
  foreground: string;
  background: string;
  qrSize: QrSize;
  href: string | null;
  logo: ArtworkLogo | null;
};

export type ProductArtworkV6 = {
  version: typeof PRESS_ARTWORK_VERSION;
  objective: SignageObjective;
  format: SignageFormat;
  templateId: SignageTemplateId;
  businessName: string;
  message: string;
  instruction: string;
  fontId: ArtworkFontId;
  ink: string;
  accent: string;
  surface: string;
  foreground: string;
  background: string;
  qrSize: QrSize;
  href: string | null;
  logo: ArtworkLogo | null;
};

export type ProductArtwork =
  | ProductArtworkV1
  | ProductArtworkV2
  | ProductArtworkV3
  | ProductArtworkV4
  | ProductArtworkV5
  | ProductArtworkV6;

export type ArtworkExportRequest = {
  artwork: ProductArtwork;
  format: ArtworkExportFormat;
};

export function artworkExportLabel(): string {
  const labels = artworkExportFormats.map((format) => format.toUpperCase());
  if (labels.length < 2) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
}

export function defaultHeadline(goal: GoogleLinkGoal): string {
  return headlineSuggestions[goal][0];
}

export function isLegacyTemplate(value: unknown): value is LegacyTemplateId {
  return artworkTemplates.some((template) => template.id === value);
}

export function isStudioTemplate(value: unknown): value is StudioTemplateId {
  return studioTemplates.some((template) => template.id === value);
}

export function isCommercialTemplate(value: unknown): value is CommercialTemplateId {
  return commercialTemplates.some((template) => template.id === value);
}

export function isCounterTemplate(value: unknown): value is CounterTemplateId {
  return counterTemplates.some((template) => template.id === value);
}

export function isSignageTemplate(value: unknown): value is SignageTemplateId {
  return signageTemplates.some((template) => template.id === value);
}

export function isSignageFormat(value: unknown): value is SignageFormat {
  return signageFormats.some((format) => format.id === value);
}

export function isSignageObjective(value: unknown): value is SignageObjective {
  return value === "review" || value === "location";
}

export function signageFormatSpec(id: SignageFormat): SignageFormatSpec {
  return signageFormats.find((format) => format.id === id) ?? signageFormats[0];
}

export function signageGoal(objective: SignageObjective): GoogleLinkGoal {
  return objective === "review" ? "resena" : "ubicacion";
}

export function isArtworkFont(value: unknown): value is ArtworkFontId {
  return artworkFonts.some((font) => font.id === value);
}

export function googleServiceLine(goal: GoogleLinkGoal): ProductArtworkV2["serviceLine"] {
  return goal === "ubicacion" ? "Google Maps" : "Reseña en Google";
}

export function templateSpec(id: ArtworkTemplateId): ArtworkTemplateSpec {
  const spec = [...artworkTemplates, ...studioTemplates, ...commercialTemplates, ...counterTemplates, ...signageTemplates].find(
    (item) => item.id === id,
  );
  if (!spec) return artworkTemplates[0];
  return spec;
}

export function buildProductArtwork(input: {
  templateId: LegacyTemplateId;
  goal: GoogleLinkGoal;
  businessName: string;
  headline: string;
  foreground: string;
  background: string;
  qrSize: QrSize;
  href: string | null;
}): ProductArtworkV1 {
  return {
    version: ARTWORK_VERSION,
    templateId: input.templateId,
    goal: input.goal,
    businessName: input.businessName.trim().slice(0, BUSINESS_NAME_MAX),
    headline: input.headline.trim().slice(0, HEADLINE_MAX),
    foreground: input.foreground,
    background: input.background,
    qrSize: input.qrSize,
    href: input.href,
  };
}

export function buildStudioArtwork(input: {
  templateId: StudioTemplateId;
  goal: GoogleLinkGoal;
  businessName: string;
  subtitle: string;
  fontId: ArtworkFontId;
  ink: string;
  accent: string;
  surface: string;
  foreground: string;
  background: string;
  qrSize: QrSize;
  href: string | null;
  logo: ArtworkLogo | null;
}): ProductArtworkV2 {
  return {
    version: STUDIO_ARTWORK_VERSION,
    templateId: input.templateId,
    goal: input.goal,
    businessName: input.businessName.trim().slice(0, BUSINESS_NAME_MAX),
    subtitle: input.subtitle.trim().slice(0, SUBTITLE_MAX),
    fontId: input.fontId,
    ink: input.ink,
    accent: input.accent,
    surface: input.surface,
    foreground: input.foreground,
    background: input.background,
    qrSize: input.qrSize,
    href: input.href,
    logo: input.logo,
    serviceLine: googleServiceLine(input.goal),
    nfc: false,
  };
}

export function buildCommercialArtwork(input: {
  templateId: CommercialTemplateId;
  goal: GoogleLinkGoal;
  businessName: string;
  subtitle: string;
  fontId: ArtworkFontId;
  ink: string;
  accent: string;
  surface: string;
  foreground: string;
  background: string;
  qrSize: QrSize;
  href: string | null;
  logo: ArtworkLogo | null;
}): ProductArtworkV3 {
  return {
    version: COMMERCIAL_ARTWORK_VERSION,
    templateId: input.templateId,
    goal: input.goal,
    businessName: input.businessName.trim().slice(0, BUSINESS_NAME_MAX),
    subtitle: input.subtitle.trim().slice(0, SUBTITLE_MAX),
    fontId: input.fontId,
    ink: input.ink,
    accent: input.accent,
    surface: input.surface,
    foreground: input.foreground,
    background: input.background,
    qrSize: input.qrSize,
    href: input.href,
    logo: input.logo,
    serviceLine: googleServiceLine(input.goal),
    nfc: false,
  };
}

export function buildCounterArtwork(input: {
  templateId: CounterTemplateId;
  goal: GoogleLinkGoal;
  businessName: string;
  subtitle: string;
  fontId: ArtworkFontId;
  ink: string;
  accent: string;
  surface: string;
  foreground: string;
  background: string;
  qrSize: QrSize;
  href: string | null;
  logo: ArtworkLogo | null;
}): ProductArtworkV4 {
  return {
    version: COUNTER_ARTWORK_VERSION,
    templateId: input.templateId,
    goal: input.goal,
    businessName: input.businessName.trim().slice(0, BUSINESS_NAME_MAX),
    subtitle: input.subtitle.trim().slice(0, SUBTITLE_MAX),
    fontId: input.fontId,
    ink: input.ink,
    accent: input.accent,
    surface: input.surface,
    foreground: input.foreground,
    background: input.background,
    qrSize: input.qrSize,
    href: input.href,
    logo: input.logo,
    serviceLine: googleServiceLine(input.goal),
    nfc: false,
  };
}

export function buildSignageArtwork(input: {
  objective: SignageObjective;
  format: SignageFormat;
  templateId: SignageTemplateId;
  businessName: string;
  fontId: ArtworkFontId;
  ink: string;
  accent: string;
  surface: string;
  foreground: string;
  background: string;
  qrSize: QrSize;
  href: string | null;
  logo: ArtworkLogo | null;
}): ProductArtworkV5 {
  const copy = signageCopy[input.objective];
  return {
    version: SIGNAGE_ARTWORK_VERSION,
    objective: input.objective,
    format: input.format,
    templateId: input.templateId,
    businessName: input.businessName.trim().slice(0, BUSINESS_NAME_MAX),
    message: copy.message,
    instruction: copy.instruction,
    fontId: input.fontId,
    ink: input.ink,
    accent: input.accent,
    surface: input.surface,
    foreground: input.foreground,
    background: input.background,
    qrSize: input.qrSize,
    href: input.href,
    logo: input.logo,
  };
}

export function buildPressArtwork(input: {
  objective: SignageObjective;
  format: SignageFormat;
  templateId: SignageTemplateId;
  businessName: string;
  fontId: ArtworkFontId;
  ink: string;
  accent: string;
  surface: string;
  foreground: string;
  background: string;
  qrSize: QrSize;
  href: string | null;
  logo: ArtworkLogo | null;
}): ProductArtworkV6 {
  const copy = pressCopy[input.objective];
  return {
    version: PRESS_ARTWORK_VERSION,
    objective: input.objective,
    format: input.format,
    templateId: input.templateId,
    businessName: input.businessName.trim().slice(0, BUSINESS_NAME_MAX),
    message: copy.message,
    instruction: copy.instruction,
    fontId: input.fontId,
    ink: input.ink,
    accent: input.accent,
    surface: input.surface,
    foreground: input.foreground,
    background: input.background,
    qrSize: input.qrSize,
    href: input.href,
    logo: input.logo,
  };
}

export function qrSlotWidth(basePercent: number, size: QrSize): string {
  const factor = size === 192 ? 0.82 : size === 256 ? 0.91 : 1;
  return `${Math.round(basePercent * factor)}%`;
}
