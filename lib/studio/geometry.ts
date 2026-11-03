import { A6_HEIGHT_MM, A6_WIDTH_MM, QR_MAX_MM } from "@/lib/studio/types";

export function mm(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeRotation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  let rotation = value % 360;
  if (rotation > 180) rotation -= 360;
  if (rotation < -180) rotation += 360;
  return mm(rotation);
}

/** How much a rotated square grows on each axis. 1 means no rotation. */
export function rotationFactor(rotation: number): number {
  const radians = (rotation * Math.PI) / 180;
  return Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians));
}

export function maxQrSize(rotation: number): number {
  const factor = rotationFactor(rotation);
  return Math.min(QR_MAX_MM, A6_WIDTH_MM / factor, A6_HEIGHT_MM / factor);
}

export type AxisBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

/** Axis-aligned bounds of a rectangle that may be rotated around its center. */
export function axisAlignedBounds(box: AxisBox): { x: number; y: number; width: number; height: number } {
  const rotation = box.rotation ?? 0;
  if (!rotation) {
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const width = box.width * cos + box.height * sin;
  const height = box.width * sin + box.height * cos;
  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
  };
}

export function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  padding = 0,
): boolean {
  return !(
    a.x + a.width + padding <= b.x ||
    b.x + b.width + padding <= a.x ||
    a.y + a.height + padding <= b.y ||
    b.y + b.height + padding <= a.y
  );
}

export function inflateBox(
  box: { x: number; y: number; width: number; height: number },
  padding: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  };
}
