import { isDatabaseUnavailable } from "@/lib/db-error";
import {
  runStudioAssetCleanup,
  studioCleanupAuthorized,
} from "@/lib/studio/assets/cleanup-job";

/**
 * Deletes expired TEMPORARY Studio assets (+ stale rate-limit buckets).
 *
 * Production scheduling (Render Cron example):
 *   Hourly POST https://qr.atajolab.dev/api/studio/assets/cleanup
 *   Header: Authorization: Bearer $STUDIO_CLEANUP_SECRET
 *
 * Uses a Postgres advisory lock so overlapping cron ticks do not double-run.
 * RETAINED assets are never deleted.
 */
export async function POST(request: Request) {
  if (!studioCleanupAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: noStore() });
  }

  try {
    const result = await runStudioAssetCleanup();
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 500, headers: noStore() });
    }
    return Response.json(
      {
        ok: true,
        skipped: result.skipped,
        deletedAssets: result.deletedAssets,
        deletedRateBuckets: result.deletedRateBuckets,
      },
      { status: 200, headers: noStore() },
    );
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "database-unavailable" }, { status: 503, headers: noStore() });
    }
    console.error("studio cleanup failed", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "cleanup-failed" }, { status: 500, headers: noStore() });
  }
}

function noStore(): Record<string, string> {
  return { "cache-control": "no-store" };
}
