import { createHash } from "node:crypto";

/**
 * Rate-limit client identity derived from HTTP requests.
 *
 * Default (`RATE_LIMIT_TRUST_PROXY` unset/empty): **ignore all client IP headers**.
 * Spoofing `X-Forwarded-For`, `CF-Connecting-IP`, or `X-Real-IP` cannot mint a fresh
 * bucket — every unauthenticated IP identity collapses to the shared `untrusted` key.
 * Draft-, order-, and email-scoped limits still apply independently.
 *
 * Opt-in `RATE_LIMIT_TRUST_PROXY=cloudflare`: use `CF-Connecting-IP` only when
 * `CF-Ray` is also present. `CF-Ray` does **not** authenticate Cloudflare by itself
 * (forgeable on a naked origin). Still requires the origin to accept traffic **only**
 * from Cloudflare (firewall / authenticated origin). Direct hits to Render can
 * forge both headers — do not enable without locking the origin. Do not set this
 * automatically; production defaults to off.
 *
 * Never trust leftmost `X-Forwarded-For` or bare `X-Real-IP`.
 */

export const RATE_LIMIT_UNTRUSTED_KEY = "untrusted";

export type RateLimitTrustProxy = "off" | "cloudflare";

export function readRateLimitTrustProxy(
  env: NodeJS.ProcessEnv = process.env,
): RateLimitTrustProxy {
  const raw = (env.RATE_LIMIT_TRUST_PROXY ?? "").trim().toLowerCase();
  if (raw === "cloudflare" || raw === "cf") return "cloudflare";
  return "off";
}

/**
 * Stable opaque key for rate-limit buckets. Never stores raw IPs.
 */
export function rateLimitClientKeyFromRequest(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const mode = readRateLimitTrustProxy(env);

  if (mode === "cloudflare") {
    const ray = request.headers.get("cf-ray")?.trim() ?? "";
    const cfIp = request.headers.get("cf-connecting-ip")?.trim() ?? "";
    // CF-Ray alone is forgeable on a naked origin; both together + origin lockdown
    // is the documented trust model. Reject XFF / X-Real-IP even in this mode.
    if (ray.length >= 8 && isClientIpLiteral(cfIp)) {
      return hashClientIp(cfIp);
    }
    return RATE_LIMIT_UNTRUSTED_KEY;
  }

  return RATE_LIMIT_UNTRUSTED_KEY;
}

export function isClientIpLiteral(value: string): boolean {
  if (value.length < 2 || value.length > 64) return false;
  if (value.includes(",")) return false;
  return /^[0-9a-fA-F:.]+$/.test(value);
}

function hashClientIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}
