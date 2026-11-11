const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

export function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

export function assessContrast(foreground: string, background: string): {
  ratio: number;
  sufficient: boolean;
  low: boolean;
  inverted: boolean;
} {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const ratio =
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);

  return {
    ratio,
    sufficient: ratio >= 3,
    low: ratio >= 3 && ratio < 4.5,
    inverted: foregroundLuminance > backgroundLuminance,
  };
}

export function formatContrastRatio(ratio: number): string {
  return `${ratio.toFixed(1).replace(".", ",")}:1`;
}

/** White type on the Mi negocio stripe, and the stripe against the cream paper. */
export function shopStripeReadable(accent: string, paper = "#f7f1e8"): boolean {
  return isHexColor(accent) && contrastRatio("#ffffff", accent) >= 4.5 && contrastRatio(accent, paper) >= 3;
}

/** Blend of two colors: 0 gives the first one, 1 the second. */
export function mixColors(from: string, to: string, share: number): string {
  if (!isHexColor(from) || !isHexColor(to)) return from;
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const t = Math.min(1, Math.max(0, share));
  return `#${a
    .map((channel, index) => Math.round(channel + (b[index]! - channel) * t).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function isDarkColor(hex: string): boolean {
  if (!isHexColor(hex)) return true;
  return relativeLuminance(hex) < 0.45;
}

function relativeLuminance(hex: string): number {
  const channels = hexToRgb(hex).map(linearize);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.slice(1);
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function linearize(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
