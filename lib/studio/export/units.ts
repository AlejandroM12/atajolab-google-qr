/** Studio export uses the same print density as commercial artwork, without importing the v7 renderer. */
export const STUDIO_PRINT_DPI = 300;
export const MM_TO_PT = 72 / 25.4;

export function studioPrintPixels(mm: number): number {
  return Math.round((mm / 25.4) * STUDIO_PRINT_DPI);
}

export function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}

export function num(value: number): string {
  return (Math.round(value * 1000) / 1000).toString();
}
