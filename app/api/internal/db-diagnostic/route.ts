import {
  collectDbDiagnostic,
  dbDiagnosticAuthorized,
  dbDiagnosticLogMarker,
} from "@/lib/db-diagnostic";

/**
 * TEMPORARY: runtime DB fingerprint for Render Free (no Shell).
 * Protect with DB_DIAGNOSTIC_SECRET (≥32). Remove after P2021 is resolved.
 *
 * Uses Prisma via lib/db (Node server runtime; not Edge-compatible).
 * cacheComponents forbids exporting `runtime` / `dynamic` route segment configs.
 */
export async function GET(request: Request) {
  if (!dbDiagnosticAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: noStore() });
  }

  try {
    const result = await collectDbDiagnostic();
    console.info("db-diagnostic ok", dbDiagnosticLogMarker(result));
    return Response.json(result, { status: 200, headers: noStore() });
  } catch {
    console.error("db-diagnostic failed");
    return Response.json({ error: "diagnostic-failed" }, { status: 500, headers: noStore() });
  }
}

function noStore(): Record<string, string> {
  return { "cache-control": "no-store" };
}
