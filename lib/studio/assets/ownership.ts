import { createPublicId } from "@/lib/public-id";
import { STUDIO_ASSET_MAX_PER_DRAFT, STUDIO_ASSET_TEMP_TTL_MS } from "@/lib/studio/assets/limits";
import { processStudioImageBytes, type ProcessStudioImageError } from "@/lib/studio/assets/process";
import type { StudioAssetRecord, StudioAssetStore } from "@/lib/studio/assets/store";

export type PutStudioAssetError =
  | ProcessStudioImageError
  | "draft-required"
  | "draft-quota"
  | "store-failed";

export type PutStudioAssetResult =
  | { ok: true; asset: StudioAssetRecord; reused: boolean }
  | { ok: false; error: PutStudioAssetError };

/** Ingest bytes under a draft. Dedupes by sha256 within the same draft. */
export async function putStudioAssetForDraft(input: {
  store: StudioAssetStore;
  draftKeyHash: string;
  bytes: Uint8Array | Buffer;
  now?: Date;
}): Promise<PutStudioAssetResult> {
  if (!input.draftKeyHash) return { ok: false, error: "draft-required" };

  const processed = await processStudioImageBytes(input.bytes);
  if (!processed.ok) return processed;

  const existing = await input.store.findByDraftSha(input.draftKeyHash, processed.sha256);
  if (existing) return { ok: true, asset: existing, reused: true };

  const count = await input.store.countByDraft(input.draftKeyHash);
  if (count >= STUDIO_ASSET_MAX_PER_DRAFT) return { ok: false, error: "draft-quota" };

  const now = input.now ?? new Date();
  try {
    const asset = await input.store.put({
      id: createPublicId(),
      sha256: processed.sha256,
      mime: processed.mime,
      width: processed.width,
      height: processed.height,
      byteLength: processed.byteLength,
      bytes: processed.bytes,
      status: "TEMPORARY",
      draftKeyHash: input.draftKeyHash,
      orderId: null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + STUDIO_ASSET_TEMP_TTL_MS),
    });
    return { ok: true, asset, reused: false };
  } catch {
    return { ok: false, error: "store-failed" };
  }
}

/**
 * Bind draft-owned assets to an order. Rejects foreign ids.
 * Retained assets stop expiring and survive cleanup.
 */
export async function retainStudioAssetsForOrder(input: {
  store: StudioAssetStore;
  draftKeyHash: string;
  orderId: string;
  assetIds: string[];
}): Promise<{ retained: string[]; rejected: string[] }> {
  const unique = [...new Set(input.assetIds)];
  return input.store.retain({
    ids: unique,
    draftKeyHash: input.draftKeyHash,
    orderId: input.orderId,
  });
}

export type AssetAccessScope =
  | { kind: "draft"; draftKeyHash: string }
  | { kind: "order"; orderId: string };

/** Load an asset only if the caller owns it via draft or retained order. */
export async function readOwnedStudioAsset(
  store: StudioAssetStore,
  id: string,
  scope: AssetAccessScope,
): Promise<StudioAssetRecord | null> {
  const asset = await store.findById(id);
  if (!asset) return null;
  if (scope.kind === "draft") {
    if (asset.draftKeyHash !== scope.draftKeyHash) return null;
    return asset;
  }
  if (asset.status !== "RETAINED" || asset.orderId !== scope.orderId) return null;
  return asset;
}
