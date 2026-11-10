import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

/**
 * family + weight must match what each TTF declares, because resvg (PNG) picks
 * fonts by the typographic family name (name ID 16, else ID 1) and OS/2 weight.
 * A mismatch silently falls back to Source Sans. lib/print/fonts.test.ts checks it.
 */
export const printFonts = {
  display: { family: "Sora", weight: 600 },
  label: { family: "Source Sans 3 SemiBold", weight: 600 },
  body: { family: "Source Sans 3", weight: 400 },
  fraunces: { family: "Fraunces", weight: 500 },
  frauncesBold: { family: "Fraunces", weight: 600 },
  sora: { family: "Sora", weight: 500 },
  sourceMedium: { family: "Source Sans 3 ExtraLight", weight: 500 },
} as const;

/**
 * Value for an SVG font-family attribute. Quoted: browsers drop unquoted
 * names with a token that starts with a digit ("Source Sans 3").
 */
export function svgFontFamily(family: string): string {
  return `'${family.replace(/['\\]/g, "")}'`;
}

export type PrintFontRole = keyof typeof printFonts;

/** Bump when rendered output changes for the same design, so cached preview URLs refresh. */
export const PREVIEW_RENDER_VERSION = "2";

type MeasuredFont = {
  unitsPerEm: number;
  layout(text: string): { advanceWidth: number };
};

const fontkit = require("fontkit") as {
  openSync(file: string): MeasuredFont;
};

const measured = new Map<PrintFontRole, MeasuredFont>();
const encoded = new Map<PrintFontRole, string>();

export function fontFile(role: PrintFontRole): string {
  if (role === "display") return path.join(process.cwd(), "assets", "fonts", "Sora-SemiBold.ttf");
  if (role === "label") return path.join(process.cwd(), "assets", "fonts", "SourceSans3-Semibold.ttf");
  if (role === "fraunces") return path.join(process.cwd(), "assets", "fonts", "Fraunces-Medium.ttf");
  if (role === "frauncesBold") return path.join(process.cwd(), "assets", "fonts", "Fraunces-SemiBold.ttf");
  if (role === "sora") return path.join(process.cwd(), "assets", "fonts", "Sora-Medium.ttf");
  if (role === "sourceMedium") return path.join(process.cwd(), "assets", "fonts", "SourceSans3-Medium.ttf");
  return path.join(process.cwd(), "assets", "fonts", "SourceSans3-Regular.ttf");
}

export function measureText(role: PrintFontRole, sizeMm: number, text: string, letterSpacingEm = 0): number {
  if (text.length === 0) return 0;
  const font = measured.get(role) ?? fontkit.openSync(fontFile(role));
  measured.set(role, font);
  const advance = (font.layout(text).advanceWidth / font.unitsPerEm) * sizeMm;
  if (text.length < 2 || letterSpacingEm === 0) return advance;
  return advance + (text.length - 1) * letterSpacingEm * sizeMm;
}

function fontBytes(role: PrintFontRole): Buffer {
  if (role === "display") return readFileSync(path.join(process.cwd(), "assets", "fonts", "Sora-SemiBold.ttf"));
  if (role === "label") return readFileSync(path.join(process.cwd(), "assets", "fonts", "SourceSans3-Semibold.ttf"));
  if (role === "fraunces") return readFileSync(path.join(process.cwd(), "assets", "fonts", "Fraunces-Medium.ttf"));
  if (role === "frauncesBold") return readFileSync(path.join(process.cwd(), "assets", "fonts", "Fraunces-SemiBold.ttf"));
  if (role === "sora") return readFileSync(path.join(process.cwd(), "assets", "fonts", "Sora-Medium.ttf"));
  if (role === "sourceMedium") return readFileSync(path.join(process.cwd(), "assets", "fonts", "SourceSans3-Medium.ttf"));
  return readFileSync(path.join(process.cwd(), "assets", "fonts", "SourceSans3-Regular.ttf"));
}

export function fontFaceCss(roles: readonly PrintFontRole[] = Object.keys(printFonts) as PrintFontRole[]): string {
  return roles
    .map((role) => {
      const font = printFonts[role];
      const data = encoded.get(role) ?? fontBytes(role).toString("base64");
      encoded.set(role, data);
      return `@font-face{font-family:"${font.family}";src:url("data:font/ttf;base64,${data}") format("truetype");font-weight:${font.weight};font-style:normal;}`;
    })
    .join("");
}
