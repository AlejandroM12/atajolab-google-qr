import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

/** Expected Neon compute/endpoint id for AtajoLab Primary (no credentials). */
export const EXPECTED_NEON_ENDPOINT_PREFIX = "ep-young-cell-b61ffznw";
export const EXPECTED_DB_NAME = "neondb";

export type DbDiagnosticResult = {
  hostClass: "neon-pooler" | "neon-direct" | "localhost" | "other" | "missing-url";
  endpointMatch: boolean;
  dbMatch: boolean;
  schema: string | null;
  searchPath: string | null;
  finishedMigrations: number | null;
  tables: {
    StudioAsset: boolean | null;
    RateLimitBucket: boolean | null;
    MailNotification: boolean | null;
  };
  mailNotificationCount: number | null;
  rateLimitBucketCount: number | null;
  errors: Array<{ op: string; code: string | null; table: string | null }>;
};

export function dbDiagnosticAuthorized(
  header: string | null,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expected = env.DB_DIAGNOSTIC_SECRET?.trim() ?? "";
  if (!expected || expected.length < 32) return false;
  if (!header) return false;
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : header.trim();
  if (bearer.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= bearer.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}

export function classifyDatabaseUrlFingerprint(raw: string | undefined): {
  hostClass: DbDiagnosticResult["hostClass"];
  endpointMatch: boolean;
  dbMatch: boolean;
} {
  if (!raw?.trim()) {
    return { hostClass: "missing-url", endpointMatch: false, dbMatch: false };
  }
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^postgresql:/i, "http:"));
  } catch {
    return { hostClass: "other", endpointMatch: false, dbMatch: false };
  }
  const host = url.hostname;
  const dbName = url.pathname.replace(/^\//, "") || "";
  const endpointPrefix = (host.split(".")[0] || "").replace(/-pooler$/i, "");
  let hostClass: DbDiagnosticResult["hostClass"] = "other";
  if (/^(127\.0\.0\.1|localhost)$/i.test(host)) hostClass = "localhost";
  else if (/\.neon\.tech$/i.test(host)) {
    hostClass = /-pooler\./i.test(host) ? "neon-pooler" : "neon-direct";
  }
  return {
    hostClass,
    endpointMatch: endpointPrefix === EXPECTED_NEON_ENDPOINT_PREFIX,
    dbMatch: dbName === EXPECTED_DB_NAME,
  };
}

type PrismaDiag = {
  $queryRawUnsafe: typeof prisma.$queryRawUnsafe;
  mailNotification: { count: typeof prisma.mailNotification.count };
  rateLimitBucket: { count: typeof prisma.rateLimitBucket.count };
};

function readPrismaTable(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("meta" in error)) return null;
  const meta = (error as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null || !("table" in meta)) return null;
  const table = (meta as { table?: unknown }).table;
  return typeof table === "string" ? table.replace(/[^A-Za-z0-9_."]/g, "").slice(0, 80) || null : null;
}

function readPrismaCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && /^P\d{4}$/.test(code) ? code : null;
}

/**
 * Read-only runtime fingerprint. Never returns URL, user, password, or full hostname.
 */
export async function collectDbDiagnostic(
  deps: {
    databaseUrl?: string;
    client?: PrismaDiag;
  } = {},
): Promise<DbDiagnosticResult> {
  const classified = classifyDatabaseUrlFingerprint(deps.databaseUrl ?? process.env.DATABASE_URL);
  const client = deps.client ?? prisma;
  const errors: DbDiagnosticResult["errors"] = [];

  let schema: string | null = null;
  let searchPath: string | null = null;
  let finishedMigrations: number | null = null;
  const tables: DbDiagnosticResult["tables"] = {
    StudioAsset: null,
    RateLimitBucket: null,
    MailNotification: null,
  };
  let mailNotificationCount: number | null = null;
  let rateLimitBucketCount: number | null = null;

  let sessionDbMatch: boolean | null = null;
  try {
    const meta = await client.$queryRawUnsafe<
      Array<{ db: string; schema: string; search_path: string }>
    >(
      `SELECT current_database() AS db,
              current_schema() AS schema,
              current_setting('search_path') AS search_path`,
    );
    schema = meta[0]?.schema ?? null;
    searchPath = meta[0]?.search_path ?? null;
    sessionDbMatch = meta[0]?.db === EXPECTED_DB_NAME;
  } catch (error) {
    errors.push({
      op: "session-meta",
      code: readPrismaCode(error),
      table: readPrismaTable(error),
    });
  }

  try {
    const mig = await client.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT COUNT(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL`,
    );
    finishedMigrations = mig[0]?.n ?? null;
  } catch (error) {
    errors.push({
      op: "migrations-count",
      code: readPrismaCode(error),
      table: readPrismaTable(error),
    });
  }

  try {
    const rows = await client.$queryRawUnsafe<
      Array<{
        studio_asset: string | null;
        rate_limit: string | null;
        mail_notification: string | null;
      }>
    >(
      `SELECT to_regclass('"StudioAsset"')::text AS studio_asset,
              to_regclass('"RateLimitBucket"')::text AS rate_limit,
              to_regclass('"MailNotification"')::text AS mail_notification`,
    );
    tables.StudioAsset = Boolean(rows[0]?.studio_asset);
    tables.RateLimitBucket = Boolean(rows[0]?.rate_limit);
    tables.MailNotification = Boolean(rows[0]?.mail_notification);
  } catch (error) {
    errors.push({
      op: "table-regclass",
      code: readPrismaCode(error),
      table: readPrismaTable(error),
    });
  }

  try {
    mailNotificationCount = await client.mailNotification.count();
  } catch (error) {
    errors.push({
      op: "mailNotification.count",
      code: readPrismaCode(error),
      table: readPrismaTable(error),
    });
  }

  try {
    rateLimitBucketCount = await client.rateLimitBucket.count();
  } catch (error) {
    errors.push({
      op: "rateLimitBucket.count",
      code: readPrismaCode(error),
      table: readPrismaTable(error),
    });
  }

  return {
    hostClass: classified.hostClass,
    endpointMatch: classified.endpointMatch,
    // URL path and live session must both be neondb (session name never returned).
    dbMatch: classified.dbMatch && sessionDbMatch !== false,
    schema,
    searchPath,
    finishedMigrations,
    tables,
    mailNotificationCount,
    rateLimitBucketCount,
    errors,
  };
}

/** Optional ops log: only boolean/hash markers, never secrets. */
export function dbDiagnosticLogMarker(result: DbDiagnosticResult): string {
  const digest = createHash("sha256")
    .update(
      [
        result.hostClass,
        result.endpointMatch ? "1" : "0",
        result.dbMatch ? "1" : "0",
        result.schema ?? "",
        String(result.finishedMigrations ?? ""),
        result.errors.map((e) => e.code ?? "").join(","),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 12);
  return digest;
}
