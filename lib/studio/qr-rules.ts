import { assessContrast, isHexColor } from "@/lib/color";
import { clamp, maxQrSize, mm, normalizeRotation, rotationFactor } from "@/lib/studio/geometry";
import {
  A6_HEIGHT_MM,
  A6_WIDTH_MM,
  QR_INK,
  QR_MIN_CONTRAST,
  QR_MIN_MM,
  QR_PAPER,
  type QrElement,
} from "@/lib/studio/types";

export type QrIssue = {
  code: "low-contrast" | "inverted" | "invalid-color";
  message: string;
};

export function qrContrastIssue(foreground: string, background: string): QrIssue | null {
  if (!isHexColor(foreground) || !isHexColor(background)) {
    return { code: "invalid-color", message: "Usá colores en formato #RRGGBB." };
  }

  const assessment = assessContrast(foreground, background);
  if (assessment.inverted) {
    return {
      code: "inverted",
      message: "El QR tiene que ser oscuro sobre un fondo claro.",
    };
  }
  if (assessment.ratio < QR_MIN_CONTRAST) {
    return {
      code: "low-contrast",
      message: "El QR no tiene suficiente contraste. Usá un código oscuro sobre un fondo claro.",
    };
  }
  return null;
}

/**
 * Keeps the QR square, inside the sheet even when rotated, and at least 22 mm.
 * The box is the unrotated rectangle. Rotation happens around its center.
 */
export function clampQrGeometry(element: QrElement): QrElement {
  const rotation = normalizeRotation(element.rotation);
  let size = Math.max(element.width, element.height);
  if (!Number.isFinite(size)) size = QR_MIN_MM;
  size = mm(clamp(size, QR_MIN_MM, maxQrSize(rotation)));

  const half = (size * rotationFactor(rotation)) / 2;
  let centerX = element.x + element.width / 2;
  let centerY = element.y + element.height / 2;
  if (!Number.isFinite(centerX)) centerX = A6_WIDTH_MM / 2;
  if (!Number.isFinite(centerY)) centerY = A6_HEIGHT_MM / 2;
  centerX = clamp(centerX, half, A6_WIDTH_MM - half);
  centerY = clamp(centerY, half, A6_HEIGHT_MM - half);

  return {
    ...element,
    x: mm(centerX - size / 2),
    y: mm(centerY - size / 2),
    width: size,
    height: size,
    rotation,
  };
}

export function safeQrColors(foreground: string, background: string): { foreground: string; background: string; repaired: boolean } {
  if (!qrContrastIssue(foreground, background)) {
    return { foreground: foreground.toLowerCase(), background: background.toLowerCase(), repaired: false };
  }
  return { foreground: QR_INK, background: QR_PAPER, repaired: true };
}
