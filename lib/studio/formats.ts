/**
 * Sheet sizes Studio can lay out, edit and export. Client-safe (no node: imports).
 *
 * Every size goes through the same engine: millimeters in the document, 300 dpi
 * PNG, vector SVG and PDF. Screen formats are sized so the PNG comes out at the
 * exact pixel size social networks expect (91.44 mm = 1080 px at 300 dpi).
 */
export type FormatId = "a6" | "a5" | "a4" | "tarjeta" | "etiqueta" | "post" | "historia";

export type Sheet = { widthMm: number; heightMm: number };

export type DesignFormat = Sheet & { id: FormatId };

export type FormatShape = "portrait" | "square" | "landscape";

export type FormatSpec = DesignFormat & {
  name: string;
  /** Where the piece is meant to be used. */
  use: string;
  /** Short size label shown next to the name. */
  size: string;
  medium: "print" | "screen";
};

export const formatList: FormatSpec[] = [
  {
    id: "a6",
    name: "Cartel A6",
    use: "Mostradores y mesas",
    size: "105 × 148 mm",
    medium: "print",
    widthMm: 105,
    heightMm: 148,
  },
  {
    id: "a5",
    name: "Flyer A5",
    use: "Flyers y mostradores",
    size: "148 × 210 mm",
    medium: "print",
    widthMm: 148,
    heightMm: 210,
  },
  {
    id: "a4",
    name: "Afiche A4",
    use: "Vidrieras y paredes",
    size: "210 × 297 mm",
    medium: "print",
    widthMm: 210,
    heightMm: 297,
  },
  {
    id: "tarjeta",
    name: "Tarjeta",
    use: "Tarjetas personales",
    size: "85 × 55 mm",
    medium: "print",
    widthMm: 85,
    heightMm: 55,
  },
  {
    id: "etiqueta",
    name: "Etiqueta",
    use: "Etiquetas y stickers",
    size: "60 × 60 mm",
    medium: "print",
    widthMm: 60,
    heightMm: 60,
  },
  {
    id: "post",
    name: "Post cuadrado",
    use: "Redes sociales",
    size: "1080 × 1080 px",
    medium: "screen",
    widthMm: 91.44,
    heightMm: 91.44,
  },
  {
    id: "historia",
    name: "Historia",
    use: "Historias y estados",
    size: "1080 × 1920 px",
    medium: "screen",
    widthMm: 91.44,
    heightMm: 162.56,
  },
];

export const DEFAULT_FORMAT_ID: FormatId = "a6";

export const A6_SHEET: Sheet = { widthMm: 105, heightMm: 148 };

export function isFormatId(value: unknown): value is FormatId {
  return typeof value === "string" && formatList.some((format) => format.id === value);
}

export function formatSpec(id: FormatId): FormatSpec {
  return formatList.find((format) => format.id === id) ?? formatList[0]!;
}

export function designFormat(id: FormatId): DesignFormat {
  const spec = formatSpec(id);
  return { id: spec.id, widthMm: spec.widthMm, heightMm: spec.heightMm };
}

/** Accepts only the exact stored shape of a known format. */
export function readDesignFormat(value: unknown): DesignFormat | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (!isFormatId(record.id)) return null;
  const format = designFormat(record.id);
  if (record.widthMm !== format.widthMm || record.heightMm !== format.heightMm) return null;
  return format;
}

export function formatShape(sheet: Sheet): FormatShape {
  const ratio = sheet.heightMm / sheet.widthMm;
  if (ratio >= 1.15) return "portrait";
  if (ratio <= 0.87) return "landscape";
  return "square";
}

/** Largest QR side for a sheet: 90 mm on A6, the same share of the short side elsewhere. */
export function qrMaxMm(sheet: Sheet): number {
  return Math.round((Math.min(sheet.widthMm, sheet.heightMm) * 6) / 7);
}

/** Largest type size offered for a sheet: 24 mm up to A6, larger on bigger sheets. */
export function fontMaxMm(sheet: Sheet): number {
  return Math.max(24, Math.floor(Math.min(sheet.widthMm, sheet.heightMm) * 0.23));
}

/** Largest corner radius: enough to turn a square as wide as the sheet into a circle. */
export function cornerMaxMm(sheet: Sheet): number {
  return Math.max(20, Math.ceil(Math.min(sheet.widthMm, sheet.heightMm) / 2));
}

/** "Cartel A6 · 105 × 148 mm" */
export function formatLabel(id: FormatId): string {
  const spec = formatSpec(id);
  return `${spec.name} · ${spec.size}`;
}
