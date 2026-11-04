import { readBodyText } from "@/lib/http/body";
import { ROUTE_LIMITS, consumeBuckets, ipBucket, rateLimitedResponse } from "@/lib/rate-limit/policies";
import { studioClientKeyFromRequest, studioRequestTrusted } from "@/lib/studio/draft-session";
import { studioExportAllowed } from "@/lib/studio/export/access";
import {
  exportStudioDesign,
  isStudioExportFormat,
  studioContentDisposition,
} from "@/lib/studio/export/index";
import { sharedRateLimiter } from "@/lib/studio/rate-limits";
import { parseDesign } from "@/lib/studio/serialize";

/** Internal Studio preview only. Not wired to orders or commercial downloads. */
const MAX_BODY_CHARS = 2_500_000;

export async function POST(
  request: Request,
  context: { params: Promise<{ format: string }> },
) {
  if (!studioExportAllowed()) {
    return Response.json({ error: "export-disabled" }, { status: 403, headers: noStore() });
  }

  if (!studioRequestTrusted(request)) {
    return Response.json({ error: "origin-rejected" }, { status: 403, headers: noStore() });
  }

  const { format } = await context.params;
  if (!isStudioExportFormat(format)) {
    return Response.json({ error: "invalid-format" }, { status: 400, headers: noStore() });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "invalid-body" }, { status: 400, headers: noStore() });
  }

  // Rendering is CPU heavy: cap per client before reading the body.
  const limited = await consumeBuckets(sharedRateLimiter(), [
    ipBucket("studio:export", studioClientKeyFromRequest(request), ROUTE_LIMITS.exportIp),
  ]);
  if (!limited.ok) return rateLimitedResponse(limited);

  let raw = "";
  try {
    raw = await readBodyText(request, MAX_BODY_CHARS);
  } catch {
    return Response.json({ error: "invalid-body" }, { status: 400, headers: noStore() });
  }
  if (raw.length === 0) {
    return Response.json({ error: "invalid-body" }, { status: 400, headers: noStore() });
  }

  // parseDesign only accepts embedded data:image/...;base64 payloads — no remote/file URLs.
  const parsed = parseDesign(raw);
  if (!parsed) {
    return Response.json({ error: "invalid-document" }, { status: 400, headers: noStore() });
  }

  const result = await exportStudioDesign(parsed.document, format);
  if (!result.ok) {
    return Response.json(
      {
        error: result.error,
        issues: result.validation?.errors ?? [],
        warnings: result.validation?.warnings ?? [],
      },
      { status: result.status, headers: noStore() },
    );
  }

  return new Response(new Uint8Array(result.body), {
    status: 200,
    headers: {
      ...noStore(),
      "content-type": result.mime,
      "content-disposition": studioContentDisposition(result.filename),
      "x-content-type-options": "nosniff",
      "x-atajolab-studio-export": "preview",
    },
  });
}

function noStore(): Record<string, string> {
  return { "cache-control": "private, no-store" };
}
