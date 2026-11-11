import type { StudioFont } from "@/lib/studio/types";

/** Keep in sync with STUDIO_TEXT_LINE_HEIGHT (export) and the Konva text nodes. */
const LINE_HEIGHT = 1.25;

/**
 * Rough line count for wrapped text, without font files, so it can run in the
 * browser. Slightly pessimistic: real metrics (lib/studio/export/wrap.ts) rarely
 * need more lines than this.
 */
export function estimateTextLines(input: { text: string; font: StudioFont; fontSize: number; width: number }): number {
  const family = input.font.replace("-bold", "");
  const bold = input.font.endsWith("-bold") ? 1.07 : 1;
  const average = input.fontSize * bold * (family === "fraunces" ? 0.53 : family === "sora" ? 0.6 : 0.48);
  const maxChars = Math.max(1, Math.floor((input.width - 0.35) / average));
  let lines = 0;
  for (const paragraph of input.text.replace(/\r\n/g, "\n").split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines += 1;
      continue;
    }
    let current = 0;
    let count = 1;
    for (const word of words) {
      const next = current === 0 ? word.length : current + 1 + word.length;
      if (current > 0 && next > maxChars) {
        count += 1;
        current = word.length;
      } else {
        current = next;
      }
    }
    lines += count;
  }
  return lines;
}

/** Largest size, down to `floor`, at which the estimated lines fit the box height. */
export function estimateFittingSize(input: {
  text: string;
  font: StudioFont;
  fontSize: number;
  width: number;
  height: number;
  floor: number;
}): number {
  // Whole tenths, never rounded up: the answer has to fit as it is.
  const floor = Math.floor(Math.min(input.floor, input.fontSize) * 10);
  for (let tenths = Math.floor(input.fontSize * 10); tenths > floor; tenths -= 1) {
    const size = tenths / 10;
    const lines = estimateTextLines({ text: input.text, font: input.font, fontSize: size, width: input.width });
    if (lines * size * LINE_HEIGHT <= input.height) return size;
  }
  return floor / 10;
}
