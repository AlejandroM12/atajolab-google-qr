import { createHash } from "node:crypto";
import sharp, { type Metadata as SharpMetadata } from "sharp";
import { classifyImage } from "@/lib/studio/images";
import {
  STUDIO_ASSET_JPEG_QUALITY,
  STUDIO_ASSET_MAX_INPUT_PIXELS,
  STUDIO_ASSET_MAX_PIXELS,
  STUDIO_ASSET_MAX_SIDE,
  STUDIO_ASSET_MAX_SOURCE_BYTES,
  STUDIO_ASSET_MAX_STORED_BYTES,
  type StudioStoredMime,
} from "@/lib/studio/assets/limits";

export type ProcessStudioImageError =
  | "empty"
  | "too-large"
  | "unsupported-type"
  | "invalid-image"
  | "dimensions"
  | "encode-failed"
  | "stored-too-large";

export type ProcessedStudioImage =
  | {
      ok: true;
      bytes: Buffer;
      mime: StudioStoredMime;
      width: number;
      height: number;
      sha256: string;
      byteLength: number;
      hadAlpha: boolean;
    }
  | { ok: false; error: ProcessStudioImageError };

/**
 * Validate magic bytes, decode with sharp, resize, and re-encode for print.
 * Does not fetch URLs. Callers must pass raw file bytes only.
 */
export async function processStudioImageBytes(input: Uint8Array | Buffer): Promise<ProcessedStudioImage> {
  const source = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (source.length === 0) return { ok: false, error: "empty" };
  if (source.length > STUDIO_ASSET_MAX_SOURCE_BYTES) return { ok: false, error: "too-large" };

  const kind = classifyImage(source);
  if (kind === "heic" || kind === "unknown") return { ok: false, error: "unsupported-type" };

  let pipeline = sharp(source, {
    failOn: "error",
    limitInputPixels: STUDIO_ASSET_MAX_INPUT_PIXELS,
  });

  let meta: SharpMetadata;
  try {
    meta = await pipeline.metadata();
  } catch {
    return { ok: false, error: "invalid-image" };
  }

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 1 || height < 1) return { ok: false, error: "invalid-image" };
  if (width * height > STUDIO_ASSET_MAX_INPUT_PIXELS) return { ok: false, error: "dimensions" };

  const hadAlpha = Boolean(meta.hasAlpha);
  const fit = fitWithin(width, height, STUDIO_ASSET_MAX_SIDE);
  if (fit.width * fit.height > STUDIO_ASSET_MAX_PIXELS) return { ok: false, error: "dimensions" };

  try {
    pipeline = sharp(source, {
      failOn: "error",
      limitInputPixels: STUDIO_ASSET_MAX_INPUT_PIXELS,
    }).rotate();

    if (fit.width !== width || fit.height !== height) {
      pipeline = pipeline.resize(fit.width, fit.height, { fit: "inside", withoutEnlargement: true });
    }

    let encoded: Buffer;
    let mime: StudioStoredMime;
    if (hadAlpha) {
      encoded = await pipeline.png({ compressionLevel: 9, palette: false }).toBuffer();
      mime = "image/png";
    } else {
      encoded = await pipeline.jpeg({ quality: STUDIO_ASSET_JPEG_QUALITY, mozjpeg: true }).toBuffer();
      mime = "image/jpeg";
      if (encoded.length > STUDIO_ASSET_MAX_STORED_BYTES) {
        encoded = await sharp(source, { failOn: "error", limitInputPixels: STUDIO_ASSET_MAX_INPUT_PIXELS })
          .rotate()
          .resize(fit.width, fit.height, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 72, mozjpeg: true })
          .toBuffer();
      }
    }

    if (encoded.length > STUDIO_ASSET_MAX_STORED_BYTES) {
      if (hadAlpha) {
        const smaller = fitWithin(fit.width, fit.height, Math.round(STUDIO_ASSET_MAX_SIDE * 0.7));
        encoded = await sharp(source, { failOn: "error", limitInputPixels: STUDIO_ASSET_MAX_INPUT_PIXELS })
          .rotate()
          .resize(smaller.width, smaller.height, { fit: "inside", withoutEnlargement: true })
          .png({ compressionLevel: 9 })
          .toBuffer();
      }
    }

    if (encoded.length > STUDIO_ASSET_MAX_STORED_BYTES) return { ok: false, error: "stored-too-large" };

    const outMeta = await sharp(encoded).metadata();
    const outWidth = outMeta.width ?? fit.width;
    const outHeight = outMeta.height ?? fit.height;
    const sha256 = createHash("sha256").update(encoded).digest("hex");

    return {
      ok: true,
      bytes: encoded,
      mime,
      width: outWidth,
      height: outHeight,
      sha256,
      byteLength: encoded.length,
      hadAlpha,
    };
  } catch {
    return { ok: false, error: "encode-failed" };
  }
}

export function parseDataImageBytes(src: string): { bytes: Buffer; declaredMime: string } | null {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(src);
  if (!match) return null;
  try {
    const bytes = Buffer.from(match[2]!, "base64");
    if (bytes.length === 0) return null;
    return { bytes, declaredMime: match[1]!.toLowerCase() };
  } catch {
    return null;
  }
}

export function toDataImageUrl(mime: StudioStoredMime, bytes: Buffer): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
