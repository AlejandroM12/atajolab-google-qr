/** Caps for Studio asset ingest. Tuned for A6 print, not unlimited CDN hosting. */
export const STUDIO_ASSET_MAX_SOURCE_BYTES = 8_000_000;
export const STUDIO_ASSET_MAX_STORED_BYTES = 600_000;
export const STUDIO_ASSET_MAX_SIDE = 1600;
/** Output / stored pixel budget after resize. */
export const STUDIO_ASSET_MAX_PIXELS = 1600 * 1600;
/** Decode budget — allows downscaling oversized sources safely. */
export const STUDIO_ASSET_MAX_INPUT_PIXELS = 4096 * 4096;
export const STUDIO_ASSET_TEMP_TTL_MS = 48 * 60 * 60 * 1000;
export const STUDIO_ASSET_MAX_PER_DRAFT = 12;
export const STUDIO_ASSET_JPEG_QUALITY = 86;

export const STUDIO_ASSET_MIMES = ["image/png", "image/jpeg"] as const;
export type StudioStoredMime = (typeof STUDIO_ASSET_MIMES)[number];
