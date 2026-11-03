import { classifyImage, type ImageKind } from "@/lib/studio/images";

const MAX_SOURCE_BYTES = 8_000_000;
const MAX_STORED_BYTES = 1_200_000;
const MAX_SIDE = 1200;

export type PreparedImage =
  | { ok: true; src: string; alt: string; width: number; height: number }
  | { ok: false; message: string };

export async function prepareStudioImage(file: File): Promise<PreparedImage> {
  if (file.size > MAX_SOURCE_BYTES) {
    return { ok: false, message: "La imagen pesa más de 8 MB. Elegí una más chica." };
  }
  if (file.size < 32) {
    return { ok: false, message: "Usá un PNG, JPG o WebP." };
  }

  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const kind = classifyImage(header, file.type);
  if (kind === "heic") {
    return { ok: false, message: "Ese archivo es HEIC. Exportalo como JPG o PNG y volvé a subirlo." };
  }
  if (kind === "unknown") {
    return { ok: false, message: "Usá un PNG, JPG o WebP." };
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    if (bitmap.width < 1 || bitmap.height < 1) {
      return { ok: false, message: "No pudimos leer esa imagen." };
    }
    let size = fit(bitmap.width, bitmap.height, MAX_SIDE);
    let blob = await encode(bitmap, size.width, size.height, kind);
    if (blob && blob.size > MAX_STORED_BYTES) {
      size = fit(size.width, size.height, Math.round(MAX_SIDE * 0.7));
      blob = await encode(bitmap, size.width, size.height, "jpeg");
    }
    if (!blob) return { ok: false, message: "No pudimos leer esa imagen." };
    if (blob.size > MAX_STORED_BYTES) {
      return { ok: false, message: "Esa imagen sigue siendo muy pesada. Probá con una más simple." };
    }
    const src = await blobToDataUrl(blob);
    if (!src.startsWith("data:image/")) {
      return { ok: false, message: "No pudimos leer esa imagen." };
    }
    return { ok: true, src, alt: altFromName(file.name), width: size.width, height: size.height };
  } catch {
    return { ok: false, message: "No pudimos leer esa imagen." };
  } finally {
    bitmap?.close();
  }
}

function fit(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  const scale = longest > maxSide ? maxSide / longest : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function encode(bitmap: ImageBitmap, width: number, height: number, kind: ImageKind): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, width, height);
  if (kind === "jpeg") return canvasToBlob(canvas, "image/jpeg", 0.86);
  const png = await canvasToBlob(canvas, "image/png");
  if (png && png.size <= MAX_STORED_BYTES) return png;
  return canvasToBlob(canvas, "image/jpeg", 0.86);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function altFromName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/\s+/g, " ").trim();
  return base.slice(0, 80) || "Imagen";
}
