import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

export const printFonts = {
  display: { family: "Sora SemiBold", weight: 600 },
  label: { family: "Source Sans 3 SemiBold", weight: 600 },
  body: { family: "Source Sans 3", weight: 400 },
  fraunces: { family: "Fraunces Medium", weight: 500 },
  frauncesBold: { family: "Fraunces SemiBold", weight: 600 },
  sora: { family: "Sora Medium", weight: 500 },
  sourceMedium: { family: "Source Sans 3 Medium", weight: 500 },
} as const;

export type PrintFontRole = keyof typeof printFonts;

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
