import type { ArtworkLogo } from "@/lib/artwork";

const MAX_LOGO_BYTES = 160_000;
const MAX_LOGO_CHARS = 220_000;

export function readPngLogo(data: string): ArtworkLogo | null {
  if (typeof data !== "string" || data.length < 32 || data.length > MAX_LOGO_CHARS) return null;
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;

  const bytes = decodeBase64(data);
  if (!bytes || bytes.length > MAX_LOGO_BYTES || encodeBase64(bytes) !== data) return null;
  if (!hasPngSignature(bytes) || !pngIsComplete(bytes)) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13) return null;
  if (ascii(bytes, 12, 4) !== "IHDR") return null;

  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  if (width < 16 || height < 16 || width > 512 || height > 512) return null;
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) return null;

  return { mime: "image/png", width, height, data };
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 33 &&
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71 &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10
  );
}

function pngIsComplete(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    if (length > bytes.length) return false;
    const next = offset + 12 + length;
    if (next > bytes.length) return false;
    const type = ascii(bytes, offset + 4, 4);
    if (type === "IEND") return next === bytes.length;
    offset = next;
  }

  return false;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) value += String.fromCharCode(bytes[offset + index] ?? 0);
  return value;
}

function decodeBase64(data: string): Uint8Array | null {
  try {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}
