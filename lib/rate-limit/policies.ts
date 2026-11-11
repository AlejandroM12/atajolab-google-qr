import { RATE_LIMIT_UNTRUSTED_KEY } from "@/lib/client-ip";
import type { RateLimiter, RateLimitResult } from "@/lib/rate-limit/postgres";

/**
 * Without a trusted proxy every visitor shares the `untrusted` key, so a
 * per-IP bucket becomes a site-wide cap. Scale it so ordinary traffic fits,
 * while draft-, order- and email-scoped buckets keep limiting each visitor.
 */
export const UNTRUSTED_IP_MULTIPLIER = 20;

export function ipScopedLimit(limit: number, clientKey: string): number {
  return clientKey === RATE_LIMIT_UNTRUSTED_KEY ? limit * UNTRUSTED_IP_MULTIPLIER : limit;
}

export type Bucket = { key: string; limit: number; windowMs: number };

/** Consumes buckets in order and stops at the first one that is full. */
export async function consumeBuckets(limiter: RateLimiter, buckets: Bucket[]): Promise<RateLimitResult> {
  let last: RateLimitResult | null = null;
  for (const bucket of buckets) {
    last = await limiter.consume(bucket.key, bucket.limit, bucket.windowMs);
    if (!last.ok) return last;
  }
  return last ?? { ok: true, remaining: 0, resetAt: new Date() };
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Shared (Postgres) limits for routes outside Studio. */
export const ROUTE_LIMITS = {
  /** POST /api/orders for v1–v7 artwork (no UI caller since Studio v8). */
  legacyOrderIp: { limit: 15, windowMs: HOUR_MS },
  /** POST /api/orders/:id/reconcile. Each call can hit Mercado Pago ~10 times. */
  reconcileOrder: { limit: 12, windowMs: 15 * MINUTE_MS },
  reconcileIp: { limit: 60, windowMs: 15 * MINUTE_MS },
  /** POST /api/orders/:id/checkout. */
  checkoutIp: { limit: 30, windowMs: 15 * MINUTE_MS },
  /** GET /api/orders/:id/files/:format. Paid buyers re-download a few times. */
  downloadOrder: { limit: 40, windowMs: HOUR_MS },
  /** POST /api/access/recover. */
  recoveryIp: { limit: 5, windowMs: 15 * MINUTE_MS },
  recoveryEmail: { limit: 3, windowMs: 15 * MINUTE_MS },
  /** POST /api/studio/export/:format (test export, off in production by default). */
  exportIp: { limit: 30, windowMs: HOUR_MS },
  /** POST /api/studio/proposals (guided flow). Each call lays out and draws up to six previews. */
  proposalsIp: { limit: 80, windowMs: HOUR_MS },
} as const;

export function ipBucket(name: string, clientKey: string, policy: { limit: number; windowMs: number }): Bucket {
  return { key: `${name}:ip:${clientKey}`, limit: ipScopedLimit(policy.limit, clientKey), windowMs: policy.windowMs };
}

export function rateLimitedResponse(result: Extract<RateLimitResult, { ok: false }>): Response {
  return Response.json(
    { error: "rate-limited" },
    {
      status: 429,
      headers: { "cache-control": "no-store", "retry-after": String(result.retryAfterSec) },
    },
  );
}
