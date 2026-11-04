/**
 * Refuses to connect the app to a remote database from a developer machine.
 *
 * The local `.env` once pointed at Neon (production). `pnpm dev` or a local
 * `next start` with that file would write orders and rate-limit rows to
 * production. Remote databases are allowed only:
 * - on Render (Render sets RENDER=true at build and runtime),
 * - during `next build` (pages read the database only at request time),
 * - or with an explicit ALLOW_REMOTE_DATABASE=1 (VPS deploy, deliberate ops).
 *
 * The Prisma CLI (`prisma migrate deploy`) does not use this module, so
 * migrations against Neon stay a deliberate, separate step.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal", "postgres", "db"]);

export type DatabaseGuard = { ok: true } | { ok: false; host: string };

export function databaseHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function checkDatabaseTarget(env: NodeJS.ProcessEnv = process.env): DatabaseGuard {
  const url = env.DATABASE_URL?.trim() ?? "";
  if (!url) return { ok: true }; // Prisma reports the missing URL itself.
  const host = databaseHost(url);
  if (host === null || LOCAL_HOSTS.has(host)) return { ok: true };
  if (env.RENDER === "true") return { ok: true };
  if (env.ALLOW_REMOTE_DATABASE === "1") return { ok: true };
  if (env.NEXT_PHASE === "phase-production-build") return { ok: true };
  return { ok: false, host };
}

export function assertDatabaseTarget(env: NodeJS.ProcessEnv = process.env): void {
  const guard = checkDatabaseTarget(env);
  if (guard.ok) return;
  throw new Error(
    `DATABASE_URL points to a remote host (${guard.host}) outside Render. ` +
      "Use the local Postgres (docker compose, 127.0.0.1:54329) in .env, " +
      "or set ALLOW_REMOTE_DATABASE=1 if this is intentional.",
  );
}
