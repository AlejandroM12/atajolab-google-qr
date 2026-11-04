import { isDatabaseUnavailable } from "@/lib/db-error";
import {
  issueStudioDraftSession,
  readStudioDraftKey,
  studioClientKeyFromRequest,
  studioDraftCookie,
  studioRequestTrusted,
  studioSecureCookies,
} from "@/lib/studio/draft-session";
import { limitStudioDraftSession } from "@/lib/studio/rate-limits";
import { logError } from "@/lib/log";

/**
 * Ensures a Studio draft session cookie exists.
 * The draftKey stays HttpOnly — never returned in the JSON body or stored in localStorage.
 */
export async function POST(request: Request) {
  if (!studioRequestTrusted(request)) {
    return jsonError(403, "origin-rejected");
  }

  try {
    const limited = await limitStudioDraftSession(studioClientKeyFromRequest(request));
    if (!limited.ok) {
      return jsonError(429, "rate-limited", {
        "retry-after": String(limited.retryAfterSec),
      });
    }

    const existing = readStudioDraftKey(request.headers.get("cookie"));
    const session = issueStudioDraftSession(existing);
    const headers = new Headers({ "cache-control": "no-store" });
    if (session.setCookie) {
      headers.set("set-cookie", studioDraftCookie(session.draftKey, studioSecureCookies()));
    }

    return Response.json(
      {
        ok: true,
        created: session.created,
      },
      { status: session.created ? 201 : 200, headers },
    );
  } catch (error) {
    if (isDatabaseUnavailable(error)) return jsonError(503, "database-unavailable");
    logError("studio.draft-session-failed", error);
    return jsonError(500, "draft-failed");
  }
}

function jsonError(status: number, error: string, extraHeaders?: Record<string, string>) {
  return Response.json(
    { error },
    {
      status,
      headers: { "cache-control": "no-store", ...extraHeaders },
    },
  );
}
