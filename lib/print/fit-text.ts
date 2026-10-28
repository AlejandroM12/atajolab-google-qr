import { measureText, type PrintFontRole } from "@/lib/print/fonts";

export type FittedText = {
  lines: string[];
  size: number;
  lineHeight: number;
  height: number;
  letterSpacing: number;
};

/**
 * Wraps on spaces and shrinks the type until it fits.
 * It never cuts a word and never inserts an ellipsis.
 */
export function fitText(input: {
  text: string;
  role: PrintFontRole;
  width: number;
  maxSize: number;
  minSize: number;
  maxLines: number;
  leading?: number;
  letterSpacing?: number;
}): FittedText | null {
  const words = input.text.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0 || input.width <= 1) return null;

  const leading = input.leading ?? 1.25;
  const letterSpacing = input.letterSpacing ?? 0;
  const min = Math.min(input.minSize, input.maxSize);
  const max = Math.max(input.minSize, input.maxSize);

  for (let size = max; size >= min - 0.001; size -= 0.2) {
    const lines = wrapWords(words, input.width, roundSize(size), input.role, letterSpacing);
    if (!lines || lines.length > input.maxLines) continue;
    const lineHeight = roundSize(size) * leading;
    return {
      lines,
      size: roundSize(size),
      lineHeight,
      height: lines.length * lineHeight,
      letterSpacing,
    };
  }

  return null;
}

function wrapWords(
  words: string[],
  width: number,
  size: number,
  role: PrintFontRole,
  letterSpacing: number,
): string[] | null {
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (measureText(role, size, word, letterSpacing) > width) return null;
    const next = current.length > 0 ? `${current} ${word}` : word;
    if (measureText(role, size, next, letterSpacing) <= width) {
      current = next;
      continue;
    }
    if (current.length === 0) return null;
    lines.push(current);
    current = word;
  }

  if (current.length > 0) lines.push(current);
  return lines;
}

function roundSize(size: number): number {
  return Math.round(size * 10) / 10;
}
