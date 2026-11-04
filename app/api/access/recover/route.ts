import { createHash } from "node:crypto";
import { isDatabaseUnavailable } from "@/lib/db-error";
import { createMailSender } from "@/lib/mail";
import {
  countActiveAccessLinks,
  findRecoveryCandidates,
  revokeAccessLinks,
  saveAccessLink,
} from "@/lib/orders";
import { appOrigin } from "@/lib/payments/checkout-policy";
import {
  parseRecoveryBody,
  recoveryAcknowledgement,
  recoveryClientKeyFromRequest,
  recoveryLimits,
  requestRecovery,
} from "@/lib/recovery";
import { readJsonBody } from "@/lib/http/body";
import { logError } from "@/lib/log";
import { ROUTE_LIMITS, consumeBuckets, ipBucket } from "@/lib/rate-limit/policies";
import { studioRequestTrusted } from "@/lib/studio/draft-session";
import { sharedRateLimiter } from "@/lib/studio/rate-limits";

const RECOVERY_WINDOW_MS = ROUTE_LIMITS.recoveryIp.windowMs;

export async function POST(request: Request) {
  if (!studioRequestTrusted(request)) return recoveryError(403, "origin-rejected");
  const body = await readJsonBody(request, 2000);
  if (body === undefined) return recoveryError(400, "invalid-body");
  const parsed = parseRecoveryBody(body);
  if (!parsed.ok) return recoveryError(400, parsed.error);

  const origin = appOrigin(process.env.APP_URL);
  try {
    // Shared Postgres buckets survive restarts and sleeps. The email is hashed
    // so the bucket table never holds an address.
    const emailKey = createHash("sha256").update(parsed.email).digest("hex").slice(0, 32);
    const limit = await consumeBuckets(sharedRateLimiter(), [
      { key: "recovery:global", limit: recoveryLimits.global * 2, windowMs: RECOVERY_WINDOW_MS },
      ipBucket("recovery", recoveryClientKeyFromRequest(request), ROUTE_LIMITS.recoveryIp),
      { key: `recovery:email:${emailKey}`, ...ROUTE_LIMITS.recoveryEmail },
    ]);
    await requestRecovery({
      email: parsed.email,
      now: new Date(),
      origin: origin?.href ?? "",
      limited: !limit.ok,
      store: {
        findOrders: findRecoveryCandidates,
        countActiveLinks: countActiveAccessLinks,
        saveLink: saveAccessLink,
        revoke: revokeAccessLinks,
      },
      sender: createMailSender(),
    });
    return Response.json(recoveryAcknowledgement(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    logError("access.recovery-failed", error);
    if (isDatabaseUnavailable(error)) return recoveryError(503, "database-unavailable");
    return recoveryError(500, "recovery-failed");
  }
}

function recoveryError(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}
