import {
  ARTWORK_VERSION,
  BUSINESS_NAME_MAX,
  COMMERCIAL_ARTWORK_VERSION,
  COUNTER_ARTWORK_VERSION,
  HEADLINE_MAX,
  PRESS_ARTWORK_VERSION,
  SIGNAGE_ARTWORK_VERSION,
  STUDIO_ARTWORK_VERSION,
  SUBTITLE_MAX,
  buildCommercialArtwork,
  buildCounterArtwork,
  buildPressArtwork,
  buildProductArtwork,
  buildSignageArtwork,
  buildStudioArtwork,
  googleServiceLine,
  isArtworkFont,
  isCommercialTemplate,
  isCounterTemplate,
  isLegacyTemplate,
  isSignageFormat,
  isSignageObjective,
  isSignageTemplate,
  isStudioTemplate,
  pressCopy,
  signageCopy,
  signageGoal,
  type ArtworkLogo,
  type ProductArtwork,
  type ProductArtworkV1,
  type ProductArtworkV2,
  type ProductArtworkV3,
  type ProductArtworkV4,
  type ProductArtworkV5,
  type ProductArtworkV6,
} from "@/lib/artwork";
import { assessContrast, isHexColor } from "@/lib/color";
import { validateGoogleLink } from "@/lib/google-link";
import { readPngLogo } from "@/lib/logo-image";
import { layoutCommercial } from "@/lib/print/commercial";
import { layoutCounter } from "@/lib/print/counter";
import { layoutPress } from "@/lib/print/press";
import { layoutSignage } from "@/lib/print/signage";
import { parseBuyerEmail } from "@/lib/buyer-email";
import { PIECE_CURRENCY, PIECE_PRICE_ARS } from "@/lib/pricing";
import { QR_SIZES, type QrSize } from "@/lib/product";

const LEGACY_FIELDS = [
  "goal",
  "url",
  "templateId",
  "businessName",
  "headline",
  "foreground",
  "background",
  "qrSize",
  "email",
] as const;

const STUDIO_FIELDS = [
  "goal",
  "url",
  "templateId",
  "businessName",
  "subtitle",
  "fontId",
  "ink",
  "accent",
  "surface",
  "foreground",
  "background",
  "qrSize",
  "logo",
  "email",
] as const;

const COMMERCIAL_FIELDS = [...STUDIO_FIELDS, "version"] as const;

const PREVIEW_FIELDS = COMMERCIAL_FIELDS.filter((field) => field !== "email");

const SIGNAGE_FIELDS = [
  "version",
  "objective",
  "url",
  "businessName",
  "logo",
  "format",
  "templateId",
  "fontId",
  "ink",
  "accent",
  "surface",
  "foreground",
  "background",
  "qrSize",
  "email",
  "reviewChecked",
] as const;

const SIGNAGE_PREVIEW_FIELDS = SIGNAGE_FIELDS.filter((field) => field !== "email" && field !== "reviewChecked");

const PRESS_FIELDS = [
  "version",
  "objective",
  "url",
  "businessName",
  "logo",
  "format",
  "templateId",
  "fontId",
  "ink",
  "accent",
  "surface",
  "foreground",
  "background",
  "qrSize",
  "email",
  "reviewChecked",
] as const;

const PRESS_PREVIEW_FIELDS = PRESS_FIELDS.filter((field) => field !== "email" && field !== "reviewChecked");

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

export type OrderDraftError =
  | "invalid-body"
  | "unexpected-field"
  | "invalid-link"
  | "insufficient-contrast"
  | "invalid-template"
  | "invalid-text"
  | "invalid-color"
  | "invalid-size"
  | "invalid-font"
  | "invalid-logo"
  | "invalid-email"
  | "title-overflow"
  | "subtitle-overflow"
  | "composition"
  | "accent-contrast"
  | "review-unverified";

export type OrderDraft = {
  amountArs: typeof PIECE_PRICE_ARS;
  currency: typeof PIECE_CURRENCY;
  artwork: ProductArtwork;
  buyerEmail: string;
};

export function parseOrderDraft(
  input: unknown,
): { ok: true; draft: OrderDraft } | { ok: false; error: OrderDraftError } {
  if (!isRecord(input)) return { ok: false, error: "invalid-body" };
  if (input.version === PRESS_ARTWORK_VERSION) return parsePressDraft(input);
  if (input.version === SIGNAGE_ARTWORK_VERSION || isSignageTemplate(input.templateId)) {
    return parseSignageDraft(input);
  }
  if (input.version === COUNTER_ARTWORK_VERSION || isCounterTemplate(input.templateId)) {
    return parseCounterDraft(input);
  }
  if (input.version === COMMERCIAL_ARTWORK_VERSION || (isCommercialTemplate(input.templateId) && input.templateId !== "dark-premium")) {
    return parseCommercialDraft(input);
  }
  if (isStudioTemplate(input.templateId)) return parseStudioDraft(input);
  if (isLegacyTemplate(input.templateId)) return parseLegacyDraft(input);
  if (!("templateId" in input)) return { ok: false, error: "invalid-body" };
  return { ok: false, error: "invalid-template" };
}

export function readArtworkSnapshot(value: unknown): ProductArtwork | null {
  if (!isRecord(value)) return null;
  if (value.version === PRESS_ARTWORK_VERSION) return readPressSnapshot(value);
  if (value.version === SIGNAGE_ARTWORK_VERSION) return readSignageSnapshot(value);
  if (value.version === COUNTER_ARTWORK_VERSION) return readCounterSnapshot(value);
  if (value.version === COMMERCIAL_ARTWORK_VERSION) return readCommercialSnapshot(value);
  if (value.version === STUDIO_ARTWORK_VERSION) return readStudioSnapshot(value);
  if (value.version === ARTWORK_VERSION) return readLegacySnapshot(value);
  return null;
}

export function parseCommercialPreview(
  input: unknown,
): { ok: true; artwork: ProductArtworkV3 } | { ok: false; error: OrderDraftError } {
  if (!isRecord(input)) return { ok: false, error: "invalid-body" };
  if (!exactFields(input, PREVIEW_FIELDS)) return { ok: false, error: fieldError(input, PREVIEW_FIELDS) };
  return readCommercialPiece(input);
}

export function parseArtworkPreview(
  input: unknown,
): { ok: true; artwork: ProductArtworkV3 | ProductArtworkV4 | ProductArtworkV5 | ProductArtworkV6 } | { ok: false; error: OrderDraftError } {
  if (!isRecord(input)) return { ok: false, error: "invalid-body" };
  if (input.version === PRESS_ARTWORK_VERSION) {
    if (!exactFields(input, PRESS_PREVIEW_FIELDS)) return { ok: false, error: fieldError(input, PRESS_PREVIEW_FIELDS) };
    return readPressPiece(input);
  }
  if (input.version === SIGNAGE_ARTWORK_VERSION || isSignageTemplate(input.templateId)) {
    if (!exactFields(input, SIGNAGE_PREVIEW_FIELDS)) return { ok: false, error: fieldError(input, SIGNAGE_PREVIEW_FIELDS) };
    return readSignagePiece(input);
  }
  if (!exactFields(input, PREVIEW_FIELDS)) return { ok: false, error: fieldError(input, PREVIEW_FIELDS) };
  if (input.version === COUNTER_ARTWORK_VERSION || isCounterTemplate(input.templateId)) return readCounterPiece(input);
  return readCommercialPiece(input);
}

function parseLegacyDraft(
  input: Record<string, unknown>,
): { ok: true; draft: OrderDraft } | { ok: false; error: OrderDraftError } {
  if (!exactFields(input, LEGACY_FIELDS)) return { ok: false, error: fieldError(input, LEGACY_FIELDS) };
  const shared = readShared(input);
  if (!shared.ok) return shared;
  if (!isLegacyTemplate(input.templateId)) return { ok: false, error: "invalid-template" };

  const buyerEmail = readBuyerEmail(input.email);
  if (!buyerEmail) return { ok: false, error: "invalid-email" };
  const headline = readText(input.headline, HEADLINE_MAX);
  if (!headline) return { ok: false, error: "invalid-text" };
  const colors = readQrColors(input.foreground, input.background);
  if (!colors.ok) return colors;

  return {
    ok: true,
    draft: draftFor(
      buildProductArtwork({
        templateId: input.templateId,
        goal: shared.goal,
        businessName: shared.businessName,
        headline,
        foreground: colors.foreground,
        background: colors.background,
        qrSize: shared.qrSize,
        href: shared.href,
      }),
      buyerEmail,
    ),
  };
}

function parseStudioDraft(
  input: Record<string, unknown>,
): { ok: true; draft: OrderDraft } | { ok: false; error: OrderDraftError } {
  if (!exactFields(input, STUDIO_FIELDS)) return { ok: false, error: fieldError(input, STUDIO_FIELDS) };
  const shared = readShared(input);
  if (!shared.ok) return shared;
  if (!isStudioTemplate(input.templateId)) return { ok: false, error: "invalid-template" };
  if (!isArtworkFont(input.fontId)) return { ok: false, error: "invalid-font" };

  const buyerEmail = readBuyerEmail(input.email);
  if (!buyerEmail) return { ok: false, error: "invalid-email" };
  const subtitle = readText(input.subtitle, SUBTITLE_MAX);
  if (!subtitle) return { ok: false, error: "invalid-text" };
  const colors = readQrColors(input.foreground, input.background);
  if (!colors.ok) return colors;
  if (typeof input.ink !== "string" || typeof input.accent !== "string" || typeof input.surface !== "string") {
    return { ok: false, error: "invalid-color" };
  }
  if (!isHexColor(input.ink) || !isHexColor(input.accent) || !isHexColor(input.surface)) {
    return { ok: false, error: "invalid-color" };
  }
  if (!assessContrast(input.ink, input.surface).sufficient) {
    return { ok: false, error: "insufficient-contrast" };
  }

  const logo = readLogo(input.logo);
  if (!logo.ok) return { ok: false, error: "invalid-logo" };

  return {
    ok: true,
    draft: draftFor(
      buildStudioArtwork({
        templateId: input.templateId,
        goal: shared.goal,
        businessName: shared.businessName,
        subtitle,
        fontId: input.fontId,
        ink: input.ink,
        accent: input.accent,
        surface: input.surface,
        foreground: colors.foreground,
        background: colors.background,
        qrSize: shared.qrSize,
        href: shared.href,
        logo: logo.logo,
      }),
      buyerEmail,
    ),
  };
}

function parseCommercialDraft(
  input: Record<string, unknown>,
): { ok: true; draft: OrderDraft } | { ok: false; error: OrderDraftError } {
  if (!exactFields(input, COMMERCIAL_FIELDS)) return { ok: false, error: fieldError(input, COMMERCIAL_FIELDS) };
  const piece = readCommercialPiece(input);
  if (!piece.ok) return piece;
  const buyerEmail = readBuyerEmail(input.email);
  if (!buyerEmail) return { ok: false, error: "invalid-email" };
  return { ok: true, draft: draftFor(piece.artwork, buyerEmail) };
}

function readCommercialPiece(
  input: Record<string, unknown>,
): { ok: true; artwork: ProductArtworkV3 } | { ok: false; error: OrderDraftError } {
  if (input.version !== COMMERCIAL_ARTWORK_VERSION) return { ok: false, error: "invalid-body" };
  const shared = readShared(input);
  if (!shared.ok) return shared;
  if (!isCommercialTemplate(input.templateId)) return { ok: false, error: "invalid-template" };
  if (!isArtworkFont(input.fontId)) return { ok: false, error: "invalid-font" };

  const subtitle = readText(input.subtitle, SUBTITLE_MAX);
  if (!subtitle) return { ok: false, error: "invalid-text" };
  const colors = readQrColors(input.foreground, input.background);
  if (!colors.ok) return colors;
  if (typeof input.ink !== "string" || typeof input.accent !== "string" || typeof input.surface !== "string") {
    return { ok: false, error: "invalid-color" };
  }
  if (!isHexColor(input.ink) || !isHexColor(input.accent) || !isHexColor(input.surface)) {
    return { ok: false, error: "invalid-color" };
  }
  if (!assessContrast(input.ink, input.surface).sufficient) {
    return { ok: false, error: "insufficient-contrast" };
  }

  const logo = readLogo(input.logo);
  if (!logo.ok) return { ok: false, error: "invalid-logo" };

  const artwork = buildCommercialArtwork({
    templateId: input.templateId,
    goal: shared.goal,
    businessName: shared.businessName,
    subtitle,
    fontId: input.fontId,
    ink: input.ink,
    accent: input.accent,
    surface: input.surface,
    foreground: colors.foreground,
    background: colors.background,
    qrSize: shared.qrSize,
    href: shared.href,
    logo: logo.logo,
  });

  try {
    const composed = layoutCommercial(artwork);
    if (!composed.ok) return { ok: false, error: composed.error };
  } catch {
    return { ok: false, error: "composition" };
  }

  return { ok: true, artwork };
}

function parseCounterDraft(
  input: Record<string, unknown>,
): { ok: true; draft: OrderDraft } | { ok: false; error: OrderDraftError } {
  if (!exactFields(input, COMMERCIAL_FIELDS)) return { ok: false, error: fieldError(input, COMMERCIAL_FIELDS) };
  const piece = readCounterPiece(input);
  if (!piece.ok) return piece;
  const buyerEmail = readBuyerEmail(input.email);
  if (!buyerEmail) return { ok: false, error: "invalid-email" };
  return { ok: true, draft: draftFor(piece.artwork, buyerEmail) };
}

function readCounterPiece(
  input: Record<string, unknown>,
): { ok: true; artwork: ProductArtworkV4 } | { ok: false; error: OrderDraftError } {
  if (input.version !== COUNTER_ARTWORK_VERSION) return { ok: false, error: "invalid-body" };
  const shared = readShared(input);
  if (!shared.ok) return shared;
  if (!isCounterTemplate(input.templateId)) return { ok: false, error: "invalid-template" };
  if (!isArtworkFont(input.fontId)) return { ok: false, error: "invalid-font" };

  const subtitle = readText(input.subtitle, SUBTITLE_MAX);
  if (!subtitle) return { ok: false, error: "invalid-text" };
  const colors = readQrColors(input.foreground, input.background);
  if (!colors.ok) return colors;
  if (typeof input.ink !== "string" || typeof input.accent !== "string" || typeof input.surface !== "string") {
    return { ok: false, error: "invalid-color" };
  }
  if (!isHexColor(input.ink) || !isHexColor(input.accent) || !isHexColor(input.surface)) {
    return { ok: false, error: "invalid-color" };
  }
  if (!assessContrast(input.ink, input.surface).sufficient) {
    return { ok: false, error: "insufficient-contrast" };
  }

  const logo = readLogo(input.logo);
  if (!logo.ok) return { ok: false, error: "invalid-logo" };

  const artwork = buildCounterArtwork({
    templateId: input.templateId,
    goal: shared.goal,
    businessName: shared.businessName,
    subtitle,
    fontId: input.fontId,
    ink: input.ink,
    accent: input.accent,
    surface: input.surface,
    foreground: colors.foreground,
    background: colors.background,
    qrSize: shared.qrSize,
    href: shared.href,
    logo: logo.logo,
  });

  try {
    const composed = layoutCounter(artwork);
    if (!composed.ok) return { ok: false, error: composed.error };
  } catch {
    return { ok: false, error: "composition" };
  }

  return { ok: true, artwork };
}

function readLegacySnapshot(value: Record<string, unknown>): ProductArtworkV1 | null {
  if (value.goal !== "ubicacion" && value.goal !== "resena") return null;
  if (!isLegacyTemplate(value.templateId)) return null;
  if (!isStoredText(value.businessName, BUSINESS_NAME_MAX) || !isStoredText(value.headline, HEADLINE_MAX)) {
    return null;
  }
  if (typeof value.foreground !== "string" || typeof value.background !== "string") return null;
  if (!isHexColor(value.foreground) || !isHexColor(value.background)) return null;
  if (!isQrSize(value.qrSize) || typeof value.href !== "string") return null;

  const link = validateGoogleLink(value.href, value.goal);
  if (!link.ok || link.href !== value.href) return null;

  return {
    version: ARTWORK_VERSION,
    templateId: value.templateId,
    goal: value.goal,
    businessName: value.businessName,
    headline: value.headline,
    foreground: value.foreground,
    background: value.background,
    qrSize: value.qrSize,
    href: link.href,
  };
}

function readStudioSnapshot(value: Record<string, unknown>): ProductArtworkV2 | null {
  if (value.goal !== "ubicacion" && value.goal !== "resena") return null;
  if (!isStudioTemplate(value.templateId) || !isArtworkFont(value.fontId)) return null;
  if (!isStoredText(value.businessName, BUSINESS_NAME_MAX) || !isStoredText(value.subtitle, SUBTITLE_MAX)) {
    return null;
  }
  if (typeof value.ink !== "string" || typeof value.accent !== "string" || typeof value.surface !== "string") {
    return null;
  }
  if (typeof value.foreground !== "string" || typeof value.background !== "string") return null;
  if (
    !isHexColor(value.ink) ||
    !isHexColor(value.accent) ||
    !isHexColor(value.surface) ||
    !isHexColor(value.foreground) ||
    !isHexColor(value.background)
  ) {
    return null;
  }
  if (!isQrSize(value.qrSize) || typeof value.href !== "string" || value.nfc !== false) return null;
  if (value.serviceLine !== googleServiceLine(value.goal)) return null;

  const link = validateGoogleLink(value.href, value.goal);
  if (!link.ok || link.href !== value.href) return null;
  const logo = readStoredLogo(value.logo);
  if (logo === undefined) return null;

  return {
    version: STUDIO_ARTWORK_VERSION,
    templateId: value.templateId,
    goal: value.goal,
    businessName: value.businessName,
    subtitle: value.subtitle,
    fontId: value.fontId,
    ink: value.ink,
    accent: value.accent,
    surface: value.surface,
    foreground: value.foreground,
    background: value.background,
    qrSize: value.qrSize,
    href: link.href,
    logo,
    serviceLine: googleServiceLine(value.goal),
    nfc: false,
  };
}

function readCommercialSnapshot(value: Record<string, unknown>): ProductArtworkV3 | null {
  if (value.goal !== "ubicacion" && value.goal !== "resena") return null;
  if (!isCommercialTemplate(value.templateId) || !isArtworkFont(value.fontId)) return null;
  if (!isStoredText(value.businessName, BUSINESS_NAME_MAX) || !isStoredText(value.subtitle, SUBTITLE_MAX)) {
    return null;
  }
  if (typeof value.ink !== "string" || typeof value.accent !== "string" || typeof value.surface !== "string") return null;
  if (typeof value.foreground !== "string" || typeof value.background !== "string") return null;
  if (
    !isHexColor(value.ink) ||
    !isHexColor(value.accent) ||
    !isHexColor(value.surface) ||
    !isHexColor(value.foreground) ||
    !isHexColor(value.background)
  ) {
    return null;
  }
  if (!isQrSize(value.qrSize) || typeof value.href !== "string" || value.nfc !== false) return null;
  if (value.serviceLine !== googleServiceLine(value.goal)) return null;

  const link = validateGoogleLink(value.href, value.goal);
  if (!link.ok || link.href !== value.href) return null;
  const logo = readStoredLogo(value.logo);
  if (logo === undefined) return null;

  return {
    version: COMMERCIAL_ARTWORK_VERSION,
    templateId: value.templateId,
    goal: value.goal,
    businessName: value.businessName,
    subtitle: value.subtitle,
    fontId: value.fontId,
    ink: value.ink,
    accent: value.accent,
    surface: value.surface,
    foreground: value.foreground,
    background: value.background,
    qrSize: value.qrSize,
    href: link.href,
    logo,
    serviceLine: googleServiceLine(value.goal),
    nfc: false,
  };
}

function readCounterSnapshot(value: Record<string, unknown>): ProductArtworkV4 | null {
  if (value.goal !== "ubicacion" && value.goal !== "resena") return null;
  if (!isCounterTemplate(value.templateId) || !isArtworkFont(value.fontId)) return null;
  if (!isStoredText(value.businessName, BUSINESS_NAME_MAX) || !isStoredText(value.subtitle, SUBTITLE_MAX)) {
    return null;
  }
  if (typeof value.ink !== "string" || typeof value.accent !== "string" || typeof value.surface !== "string") return null;
  if (typeof value.foreground !== "string" || typeof value.background !== "string") return null;
  if (
    !isHexColor(value.ink) ||
    !isHexColor(value.accent) ||
    !isHexColor(value.surface) ||
    !isHexColor(value.foreground) ||
    !isHexColor(value.background)
  ) {
    return null;
  }
  if (!isQrSize(value.qrSize) || typeof value.href !== "string" || value.nfc !== false) return null;
  if (value.serviceLine !== googleServiceLine(value.goal)) return null;

  const link = validateGoogleLink(value.href, value.goal);
  if (!link.ok || link.href !== value.href) return null;
  const logo = readStoredLogo(value.logo);
  if (logo === undefined) return null;

  return {
    version: COUNTER_ARTWORK_VERSION,
    templateId: value.templateId,
    goal: value.goal,
    businessName: value.businessName,
    subtitle: value.subtitle,
    fontId: value.fontId,
    ink: value.ink,
    accent: value.accent,
    surface: value.surface,
    foreground: value.foreground,
    background: value.background,
    qrSize: value.qrSize,
    href: link.href,
    logo,
    serviceLine: googleServiceLine(value.goal),
    nfc: false,
  };
}

function parseSignageDraft(
  input: Record<string, unknown>,
): { ok: true; draft: OrderDraft } | { ok: false; error: OrderDraftError } {
  if (!exactFields(input, SIGNAGE_FIELDS)) return { ok: false, error: fieldError(input, SIGNAGE_FIELDS) };
  if (input.objective === "review" && input.reviewChecked !== true) {
    return { ok: false, error: "review-unverified" };
  }
  if (typeof input.reviewChecked !== "boolean") return { ok: false, error: "invalid-body" };
  const piece = readSignagePiece(input);
  if (!piece.ok) return piece;
  const buyerEmail = readBuyerEmail(input.email);
  if (!buyerEmail) return { ok: false, error: "invalid-email" };
  return { ok: true, draft: draftFor(piece.artwork, buyerEmail) };
}

function readSignagePiece(
  input: Record<string, unknown>,
): { ok: true; artwork: ProductArtworkV5 } | { ok: false; error: OrderDraftError } {
  if (input.version !== SIGNAGE_ARTWORK_VERSION) return { ok: false, error: "invalid-body" };
  if (!isSignageObjective(input.objective)) return { ok: false, error: "invalid-body" };
  if (!isSignageFormat(input.format)) return { ok: false, error: "invalid-body" };
  if (!isSignageTemplate(input.templateId)) return { ok: false, error: "invalid-template" };
  if (!isArtworkFont(input.fontId)) return { ok: false, error: "invalid-font" };
  if (typeof input.url !== "string" || input.url.length > 1500) return { ok: false, error: "invalid-link" };
  const link = validateGoogleLink(input.url, signageGoal(input.objective));
  if (!link.ok) return { ok: false, error: "invalid-link" };
  const businessName = readText(input.businessName, BUSINESS_NAME_MAX);
  if (!businessName) return { ok: false, error: "invalid-text" };
  if (!isQrSize(input.qrSize)) return { ok: false, error: "invalid-size" };
  const colors = readQrColors(input.foreground, input.background);
  if (!colors.ok) return colors;
  if (typeof input.ink !== "string" || typeof input.accent !== "string" || typeof input.surface !== "string") {
    return { ok: false, error: "invalid-color" };
  }
  if (!isHexColor(input.ink) || !isHexColor(input.accent) || !isHexColor(input.surface)) {
    return { ok: false, error: "invalid-color" };
  }
  if (!assessContrast(input.ink, input.surface).sufficient) {
    return { ok: false, error: "insufficient-contrast" };
  }
  const logo = readLogo(input.logo);
  if (!logo.ok) return { ok: false, error: "invalid-logo" };

  const artwork = buildSignageArtwork({
    objective: input.objective,
    format: input.format,
    templateId: input.templateId,
    businessName,
    fontId: input.fontId,
    ink: input.ink,
    accent: input.accent,
    surface: input.surface,
    foreground: colors.foreground,
    background: colors.background,
    qrSize: input.qrSize,
    href: link.href,
    logo: logo.logo,
  });

  try {
    const composed = layoutSignage(artwork);
    if (!composed.ok) return { ok: false, error: composed.error };
  } catch {
    return { ok: false, error: "composition" };
  }

  return { ok: true, artwork };
}

function readSignageSnapshot(value: Record<string, unknown>): ProductArtworkV5 | null {
  if (!isSignageObjective(value.objective) || !isSignageFormat(value.format)) return null;
  if (!isSignageTemplate(value.templateId) || !isArtworkFont(value.fontId)) return null;
  if (!isStoredText(value.businessName, BUSINESS_NAME_MAX)) return null;
  if (!isStoredText(value.message, 80) || !isStoredText(value.instruction, 80)) return null;
  const copy = signageCopy[value.objective];
  if (value.message !== copy.message || value.instruction !== copy.instruction) return null;
  if (typeof value.ink !== "string" || typeof value.accent !== "string" || typeof value.surface !== "string") return null;
  if (typeof value.foreground !== "string" || typeof value.background !== "string") return null;
  if (
    !isHexColor(value.ink) ||
    !isHexColor(value.accent) ||
    !isHexColor(value.surface) ||
    !isHexColor(value.foreground) ||
    !isHexColor(value.background)
  ) {
    return null;
  }
  if (!isQrSize(value.qrSize) || typeof value.href !== "string") return null;
  const link = validateGoogleLink(value.href, signageGoal(value.objective));
  if (!link.ok || link.href !== value.href) return null;
  const logo = readStoredLogo(value.logo);
  if (logo === undefined) return null;

  return {
    version: SIGNAGE_ARTWORK_VERSION,
    objective: value.objective,
    format: value.format,
    templateId: value.templateId,
    businessName: value.businessName,
    message: value.message,
    instruction: value.instruction,
    fontId: value.fontId,
    ink: value.ink,
    accent: value.accent,
    surface: value.surface,
    foreground: value.foreground,
    background: value.background,
    qrSize: value.qrSize,
    href: link.href,
    logo,
  };
}

function parsePressDraft(
  input: Record<string, unknown>,
): { ok: true; draft: OrderDraft } | { ok: false; error: OrderDraftError } {
  if (!exactFields(input, PRESS_FIELDS)) return { ok: false, error: fieldError(input, PRESS_FIELDS) };
  if (input.objective === "review" && input.reviewChecked !== true) {
    return { ok: false, error: "review-unverified" };
  }
  if (typeof input.reviewChecked !== "boolean") return { ok: false, error: "invalid-body" };
  const piece = readPressPiece(input);
  if (!piece.ok) return piece;
  const buyerEmail = readBuyerEmail(input.email);
  if (!buyerEmail) return { ok: false, error: "invalid-email" };
  return { ok: true, draft: draftFor(piece.artwork, buyerEmail) };
}

function readPressPiece(
  input: Record<string, unknown>,
): { ok: true; artwork: ProductArtworkV6 } | { ok: false; error: OrderDraftError } {
  if (input.version !== PRESS_ARTWORK_VERSION) return { ok: false, error: "invalid-body" };
  if (!isSignageObjective(input.objective)) return { ok: false, error: "invalid-body" };
  if (!isSignageFormat(input.format)) return { ok: false, error: "invalid-body" };
  if (!isSignageTemplate(input.templateId)) return { ok: false, error: "invalid-template" };
  if (!isArtworkFont(input.fontId)) return { ok: false, error: "invalid-font" };
  if (typeof input.url !== "string" || input.url.length > 1500) return { ok: false, error: "invalid-link" };
  const link = validateGoogleLink(input.url, signageGoal(input.objective));
  if (!link.ok) return { ok: false, error: "invalid-link" };
  const businessName = readText(input.businessName, BUSINESS_NAME_MAX);
  if (!businessName) return { ok: false, error: "invalid-text" };
  if (!isQrSize(input.qrSize)) return { ok: false, error: "invalid-size" };
  const colors = readQrColors(input.foreground, input.background);
  if (!colors.ok) return colors;
  if (typeof input.ink !== "string" || typeof input.accent !== "string" || typeof input.surface !== "string") {
    return { ok: false, error: "invalid-color" };
  }
  if (!isHexColor(input.ink) || !isHexColor(input.accent) || !isHexColor(input.surface)) {
    return { ok: false, error: "invalid-color" };
  }
  if (!assessContrast(input.ink, input.surface).sufficient) {
    return { ok: false, error: "insufficient-contrast" };
  }
  const logo = readLogo(input.logo);
  if (!logo.ok) return { ok: false, error: "invalid-logo" };

  const artwork = buildPressArtwork({
    objective: input.objective,
    format: input.format,
    templateId: input.templateId,
    businessName,
    fontId: input.fontId,
    ink: input.ink,
    accent: input.accent,
    surface: input.surface,
    foreground: colors.foreground,
    background: colors.background,
    qrSize: input.qrSize,
    href: link.href,
    logo: logo.logo,
  });

  try {
    const composed = layoutPress(artwork);
    if (!composed.ok) return { ok: false, error: composed.error };
  } catch {
    return { ok: false, error: "composition" };
  }

  return { ok: true, artwork };
}

function readPressSnapshot(value: Record<string, unknown>): ProductArtworkV6 | null {
  if (!isSignageObjective(value.objective) || !isSignageFormat(value.format)) return null;
  if (!isSignageTemplate(value.templateId) || !isArtworkFont(value.fontId)) return null;
  if (!isStoredText(value.businessName, BUSINESS_NAME_MAX)) return null;
  if (!isStoredText(value.message, 80) || !isStoredText(value.instruction, 80)) return null;
  const copy = pressCopy[value.objective];
  if (value.message !== copy.message || value.instruction !== copy.instruction) return null;
  if (typeof value.ink !== "string" || typeof value.accent !== "string" || typeof value.surface !== "string") return null;
  if (typeof value.foreground !== "string" || typeof value.background !== "string") return null;
  if (
    !isHexColor(value.ink) ||
    !isHexColor(value.accent) ||
    !isHexColor(value.surface) ||
    !isHexColor(value.foreground) ||
    !isHexColor(value.background)
  ) {
    return null;
  }
  if (!isQrSize(value.qrSize) || typeof value.href !== "string") return null;
  const link = validateGoogleLink(value.href, signageGoal(value.objective));
  if (!link.ok || link.href !== value.href) return null;
  const logo = readStoredLogo(value.logo);
  if (logo === undefined) return null;

  return {
    version: PRESS_ARTWORK_VERSION,
    objective: value.objective,
    format: value.format,
    templateId: value.templateId,
    businessName: value.businessName,
    message: value.message,
    instruction: value.instruction,
    fontId: value.fontId,
    ink: value.ink,
    accent: value.accent,
    surface: value.surface,
    foreground: value.foreground,
    background: value.background,
    qrSize: value.qrSize,
    href: link.href,
    logo,
  };
}

function readShared(
  input: Record<string, unknown>,
):
  | { ok: true; goal: "ubicacion" | "resena"; href: string; businessName: string; qrSize: QrSize }
  | { ok: false; error: OrderDraftError } {
  if (input.goal !== "ubicacion" && input.goal !== "resena") return { ok: false, error: "invalid-body" };
  if (typeof input.url !== "string" || input.url.length > 1500) return { ok: false, error: "invalid-link" };
  const link = validateGoogleLink(input.url, input.goal);
  if (!link.ok) return { ok: false, error: "invalid-link" };
  const businessName = readText(input.businessName, BUSINESS_NAME_MAX);
  if (!businessName) return { ok: false, error: "invalid-text" };
  if (!isQrSize(input.qrSize)) return { ok: false, error: "invalid-size" };
  return { ok: true, goal: link.goal, href: link.href, businessName, qrSize: input.qrSize };
}

function readQrColors(
  foreground: unknown,
  background: unknown,
): { ok: true; foreground: string; background: string } | { ok: false; error: OrderDraftError } {
  if (typeof foreground !== "string" || typeof background !== "string") {
    return { ok: false, error: "invalid-color" };
  }
  if (!isHexColor(foreground) || !isHexColor(background)) return { ok: false, error: "invalid-color" };
  if (!assessContrast(foreground, background).sufficient) return { ok: false, error: "insufficient-contrast" };
  return { ok: true, foreground, background };
}

function readLogo(
  value: unknown,
): { ok: true; logo: ArtworkLogo | null } | { ok: false } {
  if (value === null) return { ok: true, logo: null };
  if (!isRecord(value) || Object.keys(value).some((key) => key !== "data") || typeof value.data !== "string") {
    return { ok: false };
  }
  const logo = readPngLogo(value.data);
  return logo ? { ok: true, logo } : { ok: false };
}

function readStoredLogo(value: unknown): ArtworkLogo | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || value.mime !== "image/png" || typeof value.data !== "string") return undefined;
  const logo = readPngLogo(value.data);
  if (!logo || logo.width !== value.width || logo.height !== value.height) return undefined;
  return logo;
}

function draftFor(artwork: ProductArtwork, buyerEmail: string): OrderDraft {
  return { amountArs: PIECE_PRICE_ARS, currency: PIECE_CURRENCY, artwork, buyerEmail };
}

function readBuyerEmail(value: unknown): string | null {
  return parseBuyerEmail(value);
}

function exactFields(input: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Object.keys(input);
  return keys.length === fields.length && fields.every((field) => keys.includes(field));
}

function fieldError(input: Record<string, unknown>, fields: readonly string[]): OrderDraftError {
  const allowed = new Set<string>(fields);
  return Object.keys(input).some((key) => !allowed.has(key)) ? "unexpected-field" : "invalid-body";
}

function readText(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.length > max + 20 || CONTROL_CHARS.test(value)) return null;
  const text = value.trim();
  if (text.length < 1 || text.length > max) return null;
  return text;
}

function isStoredText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim() === value && value.length >= 1 && value.length <= max;
}

function isQrSize(value: unknown): value is QrSize {
  return QR_SIZES.some((size) => size.value === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
