import { measureText } from "@/lib/print/fonts";
import { studioFontRole } from "@/lib/studio/export/fonts";
import type { StudioFont } from "@/lib/studio/types";

/** Keep in sync with Konva Text lineHeight in studio-canvas. */
export const STUDIO_TEXT_LINE_HEIGHT = 1.25;
/**
 * Browser/Konva glyph advances can differ slightly from fontkit TTF metrics.
 * Wrapping a hair early avoids edge overflow/clipping in PNG/PDF while keeping
 * line breaks close to the editor. Exact glyph equality is not guaranteed.
 */
const WRAP_SLACK_MM = 0.35;

/** Word-wrap at a fixed size, matching the Konva editor (wrap word). */
export function wrapStudioText(input: {
  text: string;
  font: StudioFont;
  fontSize: number;
  width: number;
}): { lines: string[]; lineHeight: number } {
  const lineHeight = round(input.fontSize * STUDIO_TEXT_LINE_HEIGHT);
  const wrapWidth = Math.max(1, input.width - WRAP_SLACK_MM);
  const raw = input.text.replace(/\r\n/g, "\n");
  if (raw.trim().length === 0) return { lines: [""], lineHeight };

  const role = studioFontRole(input.font);
  const lines: string[] = [];

  for (const paragraph of raw.split("\n")) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/).filter((word) => word.length > 0);
    let current = "";
    for (const word of words) {
      const next = current.length > 0 ? `${current} ${word}` : word;
      if (current.length > 0 && measureText(role, input.fontSize, next) > wrapWidth) {
        lines.push(current);
        current = word;
        continue;
      }
      current = next;
    }
    if (current.length > 0) lines.push(current);
  }

  return { lines: lines.length > 0 ? lines : [""], lineHeight };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
