import { isDatabaseUnavailable } from "@/lib/db-error";
import { readJsonBody } from "@/lib/http/body";
import { logError } from "@/lib/log";
import { readQrContentInput } from "@/lib/qr-content";
import { ROUTE_LIMITS, consumeBuckets, ipBucket, rateLimitedResponse } from "@/lib/rate-limit/policies";
import { studioClientKeyFromRequest, studioRequestTrusted } from "@/lib/studio/draft-session";
import { compileStudioScene } from "@/lib/studio/export/compile";
import { renderStudioPreviewPng } from "@/lib/studio/export/render";
import { isFormatId } from "@/lib/studio/formats";
import { isStyleId } from "@/lib/studio/proposal-options";
import { buildProposals } from "@/lib/studio/proposals";
import { sharedRateLimiter } from "@/lib/studio/rate-limits";

const MAX_BODY_BYTES = 16_000;
/** Cards are ~170 CSS px wide on phones and ~260 on desktop; 2x keeps text sharp. */
const PREVIEW_WIDTH_PX = 520;

/**
 * Design proposals for the guided flow: validates the content, lays it out on
 * every template and returns each document with a preview drawn by the export
 * engine. Nothing is stored; the QR content stays out of the logs.
 */
export async function POST(request: Request) {
  if (!studioRequestTrusted(request)) return json(403, { error: "origin-rejected" });

  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (typeof body !== "object" || body === null || Array.isArray(body)) return json(400, { error: "invalid-body" });
  const input = body as Record<string, unknown>;
  const content = readQrContentInput(input.content);
  if (!content || !isStyleId(input.styleId) || !isFormatId(input.formatId) || typeof input.name !== "string") {
    return json(400, { error: "invalid-body" });
  }
  if (input.name.length > 200) return json(400, { error: "invalid-body" });

  try {
    // Rendering is CPU heavy: cap per client before doing any layout work.
    const limited = await consumeBuckets(sharedRateLimiter(), [
      ipBucket("studio:proposals", studioClientKeyFromRequest(request), ROUTE_LIMITS.proposalsIp),
    ]);
    if (!limited.ok) return rateLimitedResponse(limited);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return json(503, { error: "database-unavailable" });
    throw error;
  }

  const result = buildProposals({
    content,
    name: input.name,
    styleId: input.styleId,
    formatId: input.formatId,
  });
  if (!result.ok) return json(422, { error: "invalid-content", field: result.field, message: result.message });

  try {
    const proposals = result.proposals.map((proposal) => ({
      id: proposal.id,
      templateId: proposal.templateId,
      name: proposal.name,
      document: proposal.document,
      preview: `data:image/png;base64,${renderStudioPreviewPng(
        compileStudioScene(proposal.document),
        PREVIEW_WIDTH_PX,
      ).toString("base64")}`,
    }));
    return json(200, { proposals });
  } catch (error) {
    logError("studio.proposals.render_failed", error);
    return json(500, { error: "render-failed" });
  }
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
}
