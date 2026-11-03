import { isPublicId } from "@/lib/public-id";

const ASSET_REF = /^asset:([A-Za-z0-9_-]{24})$/;

export function studioAssetRef(id: string): string {
  if (!isPublicId(id)) throw new Error("studio-asset-id");
  return `asset:${id}`;
}

export function parseStudioAssetRef(src: string): string | null {
  const match = ASSET_REF.exec(src);
  return match?.[1] ?? null;
}

export function isStudioAssetRef(src: string): boolean {
  return parseStudioAssetRef(src) !== null;
}

export function isDataImageUrl(src: string): boolean {
  return /^data:image\/(png|jpeg|webp);base64,/i.test(src);
}
