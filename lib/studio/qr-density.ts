/**
 * Printed QR density check. Client-safe (no node: imports).
 *
 * Long URLs need a higher QR version (more modules). At a small printed size
 * each module gets too small for phone cameras to read reliably. The version
 * is estimated from the byte-mode capacity at error correction M, which is an
 * upper bound of what the encoder picks, so the estimate is conservative.
 */

/** Byte-mode capacity (bytes) at error correction M for versions 1..40. */
const BYTE_CAPACITY_M = [
  14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666,
  711, 779, 857, 911, 997, 1059, 1125, 1190, 1264, 1370, 1452, 1538, 1628, 1722, 1809, 1911, 1989,
  2099, 2213, 2331,
];

/** Quiet zone in modules on each side; matches lib/print/qr-matrix.ts. */
const QUIET_ZONE = 4;

/** Below this module size print scans become unreliable: blocking. */
export const QR_MIN_MODULE_MM = 0.33;
/** Below this, scanning still works but needs a closer, steadier phone: warning. */
export const QR_COMFORT_MODULE_MM = 0.4;

export function estimateQrVersion(value: string): number | null {
  const bytes = new TextEncoder().encode(value).length;
  const index = BYTE_CAPACITY_M.findIndex((capacity) => bytes <= capacity);
  return index === -1 ? null : index + 1;
}

export function qrModuleMm(value: string, sizeMm: number): number | null {
  const version = estimateQrVersion(value);
  if (version === null) return null;
  const modules = 17 + version * 4 + QUIET_ZONE * 2;
  return sizeMm / modules;
}

export type QrDensity = "ok" | "tight" | "too-dense";

export function qrDensity(value: string, sizeMm: number): QrDensity {
  const moduleMm = qrModuleMm(value, sizeMm);
  if (moduleMm === null || moduleMm < QR_MIN_MODULE_MM) return "too-dense";
  if (moduleMm < QR_COMFORT_MODULE_MM) return "tight";
  return "ok";
}
