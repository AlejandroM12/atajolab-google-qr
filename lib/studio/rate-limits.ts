import {
  createMemoryRateLimiter,
  createPostgresRateLimiter,
  type RateLimiter,
  type RateLimitResult,
} from "@/lib/rate-limit/postgres";

const HOUR_MS = 60 * 60 * 1000;

export const STUDIO_DRAFT_LIMIT = { limit: 30, windowMs: HOUR_MS } as const;
export const STUDIO_UPLOAD_IP_LIMIT = { limit: 40, windowMs: HOUR_MS } as const;
export const STUDIO_UPLOAD_DRAFT_LIMIT = { limit: 60, windowMs: HOUR_MS } as const;
export const STUDIO_ORDER_IP_LIMIT = { limit: 15, windowMs: HOUR_MS } as const;
export const STUDIO_ORDER_DRAFT_LIMIT = { limit: 8, windowMs: HOUR_MS } as const;

let sharedLimiter: RateLimiter | null = null;

export function studioRateLimiter(): RateLimiter {
  if (!sharedLimiter) sharedLimiter = createPostgresRateLimiter();
  return sharedLimiter;
}

/** Test seam. */
export function setStudioRateLimiterForTests(limiter: RateLimiter | null): void {
  sharedLimiter = limiter;
}

export function createStudioTestRateLimiter(): RateLimiter {
  return createMemoryRateLimiter();
}

export async function limitStudioDraftSession(
  clientKey: string,
  limiter: RateLimiter = studioRateLimiter(),
): Promise<RateLimitResult> {
  return limiter.consume(`studio:draft:${clientKey}`, STUDIO_DRAFT_LIMIT.limit, STUDIO_DRAFT_LIMIT.windowMs);
}

export async function limitStudioUpload(
  clientKey: string,
  draftKeyHash: string,
  limiter: RateLimiter = studioRateLimiter(),
): Promise<RateLimitResult> {
  const byIp = await limiter.consume(
    `studio:upload:ip:${clientKey}`,
    STUDIO_UPLOAD_IP_LIMIT.limit,
    STUDIO_UPLOAD_IP_LIMIT.windowMs,
  );
  if (!byIp.ok) return byIp;
  return limiter.consume(
    `studio:upload:draft:${draftKeyHash}`,
    STUDIO_UPLOAD_DRAFT_LIMIT.limit,
    STUDIO_UPLOAD_DRAFT_LIMIT.windowMs,
  );
}

export async function limitStudioOrderCreate(
  clientKey: string,
  draftKeyHash: string,
  limiter: RateLimiter = studioRateLimiter(),
): Promise<RateLimitResult> {
  const byIp = await limiter.consume(
    `studio:order:ip:${clientKey}`,
    STUDIO_ORDER_IP_LIMIT.limit,
    STUDIO_ORDER_IP_LIMIT.windowMs,
  );
  if (!byIp.ok) return byIp;
  return limiter.consume(
    `studio:order:draft:${draftKeyHash}`,
    STUDIO_ORDER_DRAFT_LIMIT.limit,
    STUDIO_ORDER_DRAFT_LIMIT.windowMs,
  );
}
