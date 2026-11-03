import { prisma } from "@/lib/db";
import { createPrismaStudioAssetStore } from "@/lib/studio/assets/prisma-store";
import { purgeExpiredStudioAssets } from "@/lib/studio/assets/cleanup";
import { purgeExpiredRateLimitBuckets } from "@/lib/rate-limit/postgres";

/**
 * Advisory lock key for Studio TEMPORARY asset cleanup.
 * Production: schedule POST /api/studio/assets/cleanup with STUDIO_CLEANUP_SECRET
 * (e.g. Render Cron every hour). Never deletes RETAINED assets.
 *
 * Uses pg_try_advisory_xact_lock inside a Prisma interactive transaction so the
 * lock is held on the same pooled connection for the whole job and released
 * automatically on commit/rollback (session locks + pool would leak/cross wires).
 */
const CLEANUP_LOCK_KEY = 88442201;

export type StudioCleanupResult =
  | { ok: true; deletedAssets: number; deletedRateBuckets: number; skipped: false }
  | { ok: true; deletedAssets: 0; deletedRateBuckets: 0; skipped: true }
  | { ok: false; error: "unauthorized" | "lock-failed" | "cleanup-failed" };

export function studioCleanupAuthorized(
  header: string | null,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expected = env.STUDIO_CLEANUP_SECRET?.trim() ?? "";
  if (!expected || expected.length < 16) return false;
  if (!header) return false;
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : header.trim();
  if (bearer.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= bearer.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function runStudioAssetCleanup(now: Date = new Date()): Promise<StudioCleanupResult> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRawUnsafe<Array<{ locked: boolean }>>(
          `SELECT pg_try_advisory_xact_lock($1) AS locked`,
          CLEANUP_LOCK_KEY,
        );
        if (!locked[0]?.locked) {
          return { ok: true as const, deletedAssets: 0, deletedRateBuckets: 0, skipped: true as const };
        }

        const store = createPrismaStudioAssetStore(tx);
        const deletedAssets = await purgeExpiredStudioAssets(store, now);
        const deletedRateBuckets = await purgeExpiredRateLimitBuckets(tx, now);
        return {
          ok: true as const,
          deletedAssets,
          deletedRateBuckets,
          skipped: false as const,
        };
      },
      { timeout: 60_000 },
    );
  } catch {
    return { ok: false, error: "cleanup-failed" };
  }
}
