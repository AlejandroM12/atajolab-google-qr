import type { GoogleLinkGoal } from "@/lib/google-link";
import type { QrSize } from "@/lib/product";

export const ARTWORK_VERSION = 1 as const;
export const STUDIO_ARTWORK_VERSION = 2 as const;

export const BUSINESS_NAME_MAX = 42;
export const HEADLINE_MAX = 72;
export const SUBTITLE_MAX = 90;

export const artworkExportFormats = ["png", "svg", "pdf"] as const;

export type ArtworkExportFormat = (typeof artworkExportFormats)[number];

export type LegacyTemplateId = "tarjeta-resena" | "cartel-ubicacion" | "sticker";

export type StudioTemplateId = "minimal-elegance" | "dark-premium" | "brand-identity";

export type ArtworkTemplateId = LegacyTemplateId | StudioTemplateId;

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

export type ProductArtwork = ProductArtworkV1 | ProductArtworkV2;

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

export function isArtworkFont(value: unknown): value is ArtworkFontId {
  return artworkFonts.some((font) => font.id === value);
}

export function googleServiceLine(goal: GoogleLinkGoal): ProductArtworkV2["serviceLine"] {
  return goal === "ubicacion" ? "Google Maps" : "Reseña en Google";
}

export function templateSpec(id: ArtworkTemplateId): ArtworkTemplateSpec {
  const spec = [...artworkTemplates, ...studioTemplates].find((item) => item.id === id);
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

export function qrSlotWidth(basePercent: number, size: QrSize): string {
  const factor = size === 192 ? 0.82 : size === 256 ? 0.91 : 1;
  return `${Math.round(basePercent * factor)}%`;
}
