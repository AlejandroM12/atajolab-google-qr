import { fontFaceCss, fontFile, printFonts, svgFontFamily, type PrintFontRole } from "@/lib/print/fonts";
import type { StudioFont } from "@/lib/studio/types";

const FONT_ROLE: Record<StudioFont, PrintFontRole> = {
  source: "body",
  sora: "sora",
  fraunces: "fraunces",
};

export function studioFontRole(font: StudioFont): PrintFontRole {
  return FONT_ROLE[font];
}

export function studioFontFamily(font: StudioFont): string {
  return printFonts[studioFontRole(font)].family;
}

export function studioFontWeight(font: StudioFont): number {
  return printFonts[studioFontRole(font)].weight;
}

export function studioFontFile(font: StudioFont): string {
  return fontFile(studioFontRole(font));
}

export function studioFontFaceCss(fonts: readonly StudioFont[]): string {
  const roles = [...new Set(fonts.map(studioFontRole))];
  if (roles.length === 0) roles.push("body");
  return fontFaceCss(roles);
}

export function studioFontFiles(fonts: readonly StudioFont[]): string[] {
  const roles = [...new Set(fonts.map(studioFontRole))];
  if (roles.length === 0) roles.push("body");
  return roles.map((role) => fontFile(role));
}

export { printFonts, svgFontFamily };
