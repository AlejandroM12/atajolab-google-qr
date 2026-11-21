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
import {
  createVisitorKey,
  freeFirstQrOpen,
  hashVisitorKey,
  readVisitorKey,
  visitorCookie,
} from "@/lib/free-first-qr";
import { visitorFreeClaimUsed } from "@/lib/orders";
import { logError } from "@/lib/log";
import { credentialShape } from "@/lib/payments/checkout-policy";
import { paymentAccessToken } from "@/lib/payments/mercadopago";
import { studioSalesOpen } from "@/lib/studio/checkout-access";

/**
 * Ensures a Studio draft session cookie exists.
 * The draftKey stays HttpOnly — never returned in the JSON body or stored in localStorage.
 * While the free-first promotion is on, it also issues the visitor cookie and reports
 * whether this browser can still get its free QR (the order route re-checks it).
 * It also says whether paid orders are open and a payment credential is present,
 * so the editor can explain what is available instead of failing at the end.
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

    const cookieHeader = request.headers.get("cookie");
    const existing = readStudioDraftKey(cookieHeader);
    const session = issueStudioDraftSession(existing);
    const headers = new Headers({ "cache-control": "no-store" });
    if (session.setCookie) {
      headers.append("set-cookie", studioDraftCookie(session.draftKey, studioSecureCookies()));
    }

    let freeFirst = false;
    const promo = freeFirstQrOpen();
    if (promo) {
      let visitorKey = readVisitorKey(cookieHeader);
      if (!visitorKey) {
        visitorKey = createVisitorKey();
        headers.append("set-cookie", visitorCookie(visitorKey, studioSecureCookies()));
      }
      freeFirst = !(await visitorFreeClaimUsed(hashVisitorKey(visitorKey)));
    }

    return Response.json(
      {
        ok: true,
        created: session.created,
        freeFirst,
        promo,
        sales: studioSalesOpen(),
        // Presence and shape only; the account is verified when a payment starts.
        payments: credentialShape(paymentAccessToken()) === "ready",
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
