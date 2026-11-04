import { parseClientErrorReport } from "@/lib/client-error";
import { readJsonBody } from "@/lib/http/body";
import { logWarn, scrub } from "@/lib/log";
import { consumeBuckets, ipBucket } from "@/lib/rate-limit/policies";
import { studioClientKeyFromRequest, studioRequestTrusted } from "@/lib/studio/draft-session";
import { sharedRateLimiter } from "@/lib/studio/rate-limits";

/** Receives error-boundary reports from the browser and writes them to server logs. */
export async function POST(request: Request) {
  if (!studioRequestTrusted(request)) return new Response(null, { status: 204 });
  const body = await readJsonBody(request, 2000);
  const report = parseClientErrorReport(body);
  if (!report) return new Response(null, { status: 204 });

  try {
    const limited = await consumeBuckets(sharedRateLimiter(), [
      ipBucket("client-error", studioClientKeyFromRequest(request), { limit: 20, windowMs: 60 * 60_000 }),
    ]);
    if (!limited.ok) return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 204 });
  }

  logWarn("client.error", {
    boundary: report.boundary,
    path: report.path,
    digest: report.digest,
    errorMessage: scrub(report.message, 300),
  });
  return new Response(null, { status: 204 });
}
