import type { ArtworkLogo } from "@/lib/artwork";
import { readPngLogo } from "@/lib/logo-image";

const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp"]);
const SIZES = [384, 256, 192];

export type LogoPrepareError = "type" | "size" | "read";

export async function prepareLogoFile(
  file: File,
): Promise<{ ok: true; logo: ArtworkLogo } | { ok: false; error: LogoPrepareError }> {
  if (!ACCEPTED.has(file.type) || file.size < 32 || file.size > 2_000_000) {
    return { ok: false, error: file.size > 2_000_000 ? "size" : "type" };
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!magicMatches(file.type, header)) return { ok: false, error: "type" };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, error: "read" };
  }

  try {
    for (const size of SIZES) {
      const blob = await renderSquare(bitmap, size);
      if (!blob || blob.size > 160_000) continue;
      const data = await blobToBase64(blob);
      const logo = readPngLogo(data);
      if (logo) return { ok: true, logo };
    }
    return { ok: false, error: "size" };
  } finally {
    bitmap.close();
  }
}

function magicMatches(type: string, header: Uint8Array): boolean {
  if (type === "image/png") {
    return header[0] === 137 && header[1] === 80 && header[2] === 78 && header[3] === 71;
  }
  if (type === "image/jpeg") return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  return (
    ascii(header, 0, 4) === "RIFF" &&
    ascii(header, 8, 4) === "WEBP"
  );
}

function renderSquare(bitmap: ImageBitmap, size: number): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);

  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) value += String.fromCharCode(bytes[offset + index] ?? 0);
  return value;
}
