import { standbyHost } from "@/lib/standby-host";
import { parseOrderDraft } from "@/lib/order-draft";
import { isDatabaseUnavailable } from "@/lib/db-error";
import { freeClaimTaken, savePendingOrder, type FreeOrderClaim } from "@/lib/orders";
import {
  freeFirstQrBuckets,
  freeFirstQrOpen,
  hashFreeEmail,
  hashVisitorKey,
  readVisitorKey,
} from "@/lib/free-first-qr";
import { orderAccessCookie } from "@/lib/payments/access";
import { appOrigin } from "@/lib/payments/checkout-policy";
import { PIECE_CURRENCY, PIECE_PRICE_ARS } from "@/lib/pricing";
import {
  readStudioDraftKey,
  studioClientKeyFromRequest,
  studioRequestTrusted,
} from "@/lib/studio/draft-session";
import { hashStudioDraftKey } from "@/lib/studio/assets/draft-key";
import { studioSalesOpen } from "@/lib/studio/checkout-access";
import { legal } from "@/lib/legal";
import { limitStudioOrderCreate, sharedRateLimiter } from "@/lib/studio/rate-limits";
import { readBodyText } from "@/lib/http/body";
import { logError, logInfo } from "@/lib/log";
import { ROUTE_LIMITS, consumeBuckets, ipBucket } from "@/lib/rate-limit/policies";

const MAX_BODY_CHARS = 320_000;
/** Dehydrated Studio v8 documents stay well under this; blocks accidental embedded images. */
const MAX_STUDIO_V8_BODY_CHARS = 400_000;

export async function POST(request: Request) {
  // The standby host (Render) takes no new orders of any version; the service is on the VPS.
  if (standbyHost()) return orderError(503, "standby-host");

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return orderError(400, "invalid-body");
  }

  let raw = "";
  try {
    raw = await readBodyText(request, MAX_STUDIO_V8_BODY_CHARS);
  } catch {
    return orderError(400, "invalid-body");
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return orderError(400, "invalid-body");
  }

  const studioV8 =
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    (body as { version?: unknown }).version === 8;

  if (raw.length > (studioV8 ? MAX_STUDIO_V8_BODY_CHARS : MAX_BODY_CHARS)) {
    return orderError(400, "invalid-body");
  }

  const salesOpen = studioSalesOpen();
  const promoOpen = studioV8 && freeFirstQrOpen();
  if (studioV8 && !salesOpen && !promoOpen) {
    return orderError(403, "studio-checkout-disabled");
  }

  // Terms acceptance is checked here (the strict v8 parser keeps its field list)
  // and recorded in the logs with the version of the legal texts.
  if (studioV8) {
    const record = body as Record<string, unknown>;
    if (record.acceptedTerms !== true) return orderError(400, "terms-required");
    delete record.acceptedTerms;
  }

  // Cookie-setting endpoint: same-origin browser posts only, for every artwork version.
  if (!studioRequestTrusted(request)) {
    return orderError(403, "origin-rejected");
  }

  if (!studioV8) {
    const limited = await consumeBuckets(sharedRateLimiter(), [
      ipBucket("orders:legacy", studioClientKeyFromRequest(request), ROUTE_LIMITS.legacyOrderIp),
    ]);
    if (!limited.ok) {
      return orderError(429, "rate-limited", { "retry-after": String(limited.retryAfterSec) });
    }
  }

  const studioDraftKey = studioV8 ? readStudioDraftKey(request.headers.get("cookie")) : null;
  if (studioV8) {
    if (!studioDraftKey) return orderError(401, "studio-draft-key");
    const limited = await limitStudioOrderCreate(
      studioClientKeyFromRequest(request),
      hashStudioDraftKey(studioDraftKey),
    );
    if (!limited.ok) {
      return orderError(429, "rate-limited", {
        "retry-after": String(limited.retryAfterSec),
      });
    }
  }

  const parsed = parseOrderDraft(body, { studioDraftKey });
  if (!parsed.ok) return orderError(400, parsed.error);

  try {
    // "Tu primer QR es gratis": decided here, never by the browser.
    let free: FreeOrderClaim | null = null;
    const visitorKey = promoOpen ? readVisitorKey(request.headers.get("cookie")) : null;
    if (visitorKey && parsed.draft.buyerEmail) {
      const claim = {
        visitorKeyHash: hashVisitorKey(visitorKey),
        emailHash: hashFreeEmail(parsed.draft.buyerEmail),
      };
      if (!(await freeClaimTaken(claim))) {
        const freeLimited = await consumeBuckets(
          sharedRateLimiter(),
          freeFirstQrBuckets(studioClientKeyFromRequest(request)),
        );
        if (freeLimited.ok) free = claim;
        else logInfo("order.free-first-limited");
      }
    }

    const created = await savePendingOrder(parsed.draft, { free, allowPaid: !studioV8 || salesOpen });
    if (studioV8) {
      logInfo("order.terms-accepted", { publicId: created.publicId, termsVersion: legal.lastUpdated });
    }
    if (created.status === "FREE") {
      logInfo("order.free-first-created", { publicId: created.publicId });
    }
    const headers = new Headers({ "cache-control": "no-store" });
    headers.set(
      "set-cookie",
      orderAccessCookie(
        created.publicId,
        created.deliveryKey,
        appOrigin(process.env.APP_URL)?.protocol === "https:",
      ),
    );
    return Response.json(
      {
        publicId: created.publicId,
        status: created.status,
        amountArs: created.status === "FREE" ? 0 : PIECE_PRICE_ARS,
        currency: PIECE_CURRENCY,
      },
      { status: 201, headers },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "order-assets") {
      return orderError(400, "studio-assets");
    }
    if (error instanceof Error && error.message === "free-unavailable") {
      return orderError(409, "free-already-used");
    }
    if (error instanceof Error && error.message === "order-idempotency-conflict") {
      return orderError(409, "studio-idempotency-conflict");
    }
    if (error instanceof Error && (error.message === "order-idempotency" || error.message === "order-access-secret")) {
      return orderError(503, "order-failed");
    }
    logError("order.create-failed", error, { version: studioV8 ? 8 : "legacy" });
    if (isDatabaseUnavailable(error)) return orderError(503, "database-unavailable");
    return orderError(500, "order-failed");
  }
}

function orderError(status: number, error: string, extraHeaders?: Record<string, string>) {
  return Response.json(
    { error },
    { status, headers: { "cache-control": "no-store", ...extraHeaders } },
  );
}
