/** Parse a studio number field. Commas are accepted as decimals. */
export function parseStudioNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function clampStudioNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatStudioNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export function commitStudioNumber(raw: string, min: number, max: number): number | null {
  const parsed = parseStudioNumber(raw);
  if (parsed === null) return null;
  return clampStudioNumber(parsed, min, max);
}
