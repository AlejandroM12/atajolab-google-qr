import type { StudioAssetStore } from "@/lib/studio/assets/store";

/**
 * Deletes TEMPORARY assets past expiresAt.
 * RETAINED assets (order-bound) are never removed here.
 */
export async function purgeExpiredStudioAssets(
  store: StudioAssetStore,
  now: Date = new Date(),
): Promise<number> {
  return store.deleteExpired(now);
}
