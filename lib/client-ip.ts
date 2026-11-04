import { createHmac } from "node:crypto";

/**
 * Rate-limit client identity derived from HTTP requests.
 *
 * Modes (`RATE_LIMIT_TRUST_PROXY`):
 *
 * - unset / `off` (default): **ignore all client IP headers**. Every visitor
 *   shares the `untrusted` key, so per-IP buckets act as site-wide caps. The
 *   limits in `lib/studio/rate-limits.ts` scale those caps up for that key so
 *   normal traffic is not blocked; draft-, order- and email-scoped limits
 *   still apply per visitor.
 *
 * - `xff`: the app sits behind proxies that **append** the connecting address
 *   to `X-Forwarded-For` (Render's load balancer, Caddy in `deploy/Caddyfile`).
 *   The client address is the entry added by the outermost trusted proxy:
 *   counting from the right, skip `RATE_LIMIT_PROXY_HOPS - 1` entries
 *   (default 1 = rightmost). Entries to the left of it are client-controlled
 *   and never used. Only enable when every request reaches the app through
 *   those proxies (Render web services do; a VPS must bind to 127.0.0.1).
 *
 * - `cloudflare`: use `CF-Connecting-IP` only when `CF-Ray` is also present.
 *   `CF-Ray` does not authenticate Cloudflare by itself, so the origin must
 *   accept traffic only from Cloudflare.
 *
 * Raw IPs are never stored; keys are truncated SHA-256 hashes.
 */

export const RATE_LIMIT_UNTRUSTED_KEY = "untrusted";

export type RateLimitTrustProxy = "off" | "xff" | "cloudflare";

export function readRateLimitTrustProxy(
  env: NodeJS.ProcessEnv = process.env,
): RateLimitTrustProxy {
  const raw = (env.RATE_LIMIT_TRUST_PROXY ?? "").trim().toLowerCase();
  if (raw === "cloudflare" || raw === "cf") return "cloudflare";
  if (raw === "xff" || raw === "render" || raw === "caddy") return "xff";
  return "off";
}

export function readProxyHops(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseInt((env.RATE_LIMIT_PROXY_HOPS ?? "").trim(), 10);
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(raw, 5);
}

/**
 * Address appended by the trusted proxy chain, or null when the header is
 * missing, malformed or shorter than the configured hop count.
 */
export function trustedForwardedAddress(header: string | null, hops: number): string | null {
  if (!header) return null;
  const entries = header
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (entries.length < hops || entries.length > 20) return null;
  const candidate = normalizeIp(entries[entries.length - hops]!);
  return isClientIpLiteral(candidate) ? candidate : null;
}

/**
 * Stable opaque key for rate-limit buckets. Never stores raw IPs.
 */
export function rateLimitClientKeyFromRequest(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const mode = readRateLimitTrustProxy(env);

  if (mode === "xff") {
    const address = trustedForwardedAddress(request.headers.get("x-forwarded-for"), readProxyHops(env));
    return address ? hashClientIp(address, env) : RATE_LIMIT_UNTRUSTED_KEY;
  }

  if (mode === "cloudflare") {
    const ray = request.headers.get("cf-ray")?.trim() ?? "";
    const cfIp = request.headers.get("cf-connecting-ip")?.trim() ?? "";
    // CF-Ray alone is forgeable on a naked origin; both together + origin lockdown
    // is the documented trust model. Reject XFF / X-Real-IP even in this mode.
    if (ray.length >= 8 && isClientIpLiteral(cfIp)) {
      return hashClientIp(cfIp, env);
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

/** Strips an IPv4 port (`1.2.3.4:5678`) and IPv6 brackets (`[::1]:443`). */
function normalizeIp(value: string): string {
  const bracketed = /^\[([0-9a-fA-F:.]+)\](?::\d+)?$/.exec(value);
  if (bracketed) return bracketed[1]!;
  const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value);
  if (v4WithPort) return v4WithPort[1]!;
  return value;
}

/**
 * Keyed hash: a plain SHA-256 of an IPv4 address can be reversed by trying
 * all 2^32 addresses. The key comes from a server secret, so bucket keys and
 * the operator health view never reveal the address.
 */
function hashClientIp(ip: string, env: NodeJS.ProcessEnv): string {
  const secret =
    env.RATE_LIMIT_HASH_SECRET?.trim() || env.ORDER_ACCESS_SECRET?.trim() || "atajolab-rate-limit-dev-only";
  return createHmac("sha256", secret).update(`rate-limit:${ip}`).digest("hex").slice(0, 32);
}
