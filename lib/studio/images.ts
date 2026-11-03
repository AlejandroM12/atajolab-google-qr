import { MAX_IMAGE_CHARS } from "@/lib/studio/types";

export type ImageKind = "png" | "jpeg" | "webp" | "heic" | "unknown";

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);
const DATA_URL = /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/]+={0,2}$/i;

export function classifyImage(bytes: Uint8Array, mime = ""): ImageKind {
  const declared = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  if (isHeic(bytes) || declared === "image/heic" || declared === "image/heif") return "heic";
  if (isPng(bytes)) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (isWebp(bytes)) return "webp";
  return "unknown";
}

export function imageSrcIssue(src: string): "type" | "size" | null {
  if (src.length > MAX_IMAGE_CHARS) return "size";
  if (!DATA_URL.test(src)) return "type";
  return null;
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function isHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const ftyp =
    bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
  if (!ftyp) return false;
  const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!).toLowerCase();
  return HEIC_BRANDS.has(brand);
}
