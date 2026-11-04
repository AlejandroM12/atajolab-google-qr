/** Millimeters on the physical A6 sheet. The editor scales this same document to the screen. */
export const STUDIO_VERSION = 8 as const;

export const A6_WIDTH_MM = 105;
export const A6_HEIGHT_MM = 148;
export const QR_MIN_MM = 22;
export const QR_MAX_MM = 90;
export const QR_MIN_CONTRAST = 4.5;
export const MAX_ELEMENTS = 40;
export const MAX_PARKED = 40;
export const MAX_TEXT = 180;
export const MAX_QR_VALUE = 500;
export const MAX_ALT = 80;
export const MAX_IMAGE_CHARS = 1_800_000;

export const QR_INK = "#14221f";
export const QR_PAPER = "#ffffff";

export type StudioFont = "source" | "sora" | "fraunces";
export type TextAlign = "left" | "center" | "right";
export type TemplateId =
  | "clasico"
  | "vivo"
  | "nocturno"
  | "negocio"
  | "corporativo"
  | "creativo";

export type ElementBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

type ElementBase = ElementBox & {
  id: string;
  role: string | null;
};

export type TextElement = ElementBase & {
  type: "text";
  text: string;
  font: StudioFont;
  fontSize: number;
  fill: string;
  align: TextAlign;
};

export type RectElement = ElementBase & {
  type: "rect";
  fill: string;
  cornerRadius: number;
};

export type ImageElement = ElementBase & {
  type: "image";
  src: string;
  alt: string;
};

export type QrElement = ElementBase & {
  type: "qr";
  value: string;
  foreground: string;
  background: string;
};

export type StudioElement = TextElement | RectElement | ImageElement | QrElement;

export type TemplateLayoutSnapshot = {
  elements: StudioElement[];
  parked: StudioElement[];
};

export type DesignDocumentV8 = {
  version: typeof STUDIO_VERSION;
  format: {
    id: "a6";
    widthMm: typeof A6_WIDTH_MM;
    heightMm: typeof A6_HEIGHT_MM;
  };
  background: string;
  templateId: TemplateId;
  /** Saved arrangements per template so switching back restores local layout. */
  layouts: Partial<Record<TemplateId, TemplateLayoutSnapshot>>;
  elements: StudioElement[];
  parked: StudioElement[];
};

export type ElementPatch = Partial<
  Pick<
    TextElement,
    "x" | "y" | "width" | "height" | "rotation" | "text" | "font" | "fontSize" | "fill" | "align"
  >
> &
  Partial<Pick<RectElement, "cornerRadius">> &
  Partial<Pick<ImageElement, "src" | "alt">> &
  Partial<Pick<QrElement, "value" | "foreground" | "background">>;
