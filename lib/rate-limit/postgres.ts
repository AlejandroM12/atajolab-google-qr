import { prisma } from "@/lib/db";

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: Date }
  | { ok: false; retryAfterSec: number; resetAt: Date };

export type RateLimiter = {
  consume(bucketKey: string, limit: number, windowMs: number, now?: Date): Promise<RateLimitResult>;
};

/**
 * Fixed-window counters persisted in PostgreSQL so limits are shared across app instances.
 * Uses an atomic upsert; expired windows reset on the next hit.
 */
export function createPostgresRateLimiter(
  client: {
    $queryRawUnsafe: typeof prisma.$queryRawUnsafe;
  } = prisma,
): RateLimiter {
  return {
    async consume(bucketKey, limit, windowMs, now = new Date()): Promise<RateLimitResult> {
      if (!bucketKey || limit < 1 || windowMs < 1_000) {
        return { ok: false, retryAfterSec: 60, resetAt: new Date(now.getTime() + 60_000) };
      }

      const windowStart = now;
      const expiresAt = new Date(now.getTime() + windowMs);
      const rows = await client.$queryRawUnsafe<Array<{ count: number; expiresAt: Date }>>(
        `
        INSERT INTO "RateLimitBucket" ("bucketKey", "count", "windowStart", "expiresAt")
        VALUES ($1, 1, $2, $3)
        ON CONFLICT ("bucketKey") DO UPDATE
        SET
          "count" = CASE
            WHEN "RateLimitBucket"."expiresAt" <= $2 THEN 1
            ELSE "RateLimitBucket"."count" + 1
          END,
          "windowStart" = CASE
            WHEN "RateLimitBucket"."expiresAt" <= $2 THEN $2
            ELSE "RateLimitBucket"."windowStart"
          END,
          "expiresAt" = CASE
            WHEN "RateLimitBucket"."expiresAt" <= $2 THEN $3
            ELSE "RateLimitBucket"."expiresAt"
          END
        RETURNING "count", "expiresAt"
        `,
        bucketKey,
        windowStart,
        expiresAt,
      );

      const row = rows[0];
      if (!row) {
        return { ok: false, retryAfterSec: Math.ceil(windowMs / 1000), resetAt: expiresAt };
      }

      const resetAt = new Date(row.expiresAt);
      if (row.count > limit) {
        return {
          ok: false,
          retryAfterSec: Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000)),
          resetAt,
        };
      }

      return { ok: true, remaining: Math.max(0, limit - row.count), resetAt };
    },
  };
}

/** In-memory limiter for unit tests only. */
export function createMemoryRateLimiter(): RateLimiter {
  const buckets = new Map<string, { count: number; expiresAt: number }>();
  return {
    async consume(bucketKey, limit, windowMs, now = new Date()): Promise<RateLimitResult> {
      const moment = now.getTime();
      const current = buckets.get(bucketKey);
      if (!current || current.expiresAt <= moment) {
        const expiresAt = moment + windowMs;
        buckets.set(bucketKey, { count: 1, expiresAt });
        return { ok: true, remaining: limit - 1, resetAt: new Date(expiresAt) };
      }
      current.count += 1;
      if (current.count > limit) {
        return {
          ok: false,
          retryAfterSec: Math.max(1, Math.ceil((current.expiresAt - moment) / 1000)),
          resetAt: new Date(current.expiresAt),
        };
      }
      return { ok: true, remaining: limit - current.count, resetAt: new Date(current.expiresAt) };
    },
  };
}

export async function purgeExpiredRateLimitBuckets(
  client: {
    rateLimitBucket: {
      deleteMany: (args: {
        where: { expiresAt: { lte: Date } };
      }) => Promise<{ count: number }>;
    };
  } = prisma,
  now: Date = new Date(),
): Promise<number> {
  const result = await client.rateLimitBucket.deleteMany({ where: { expiresAt: { lte: now } } });
  return result.count;
}
