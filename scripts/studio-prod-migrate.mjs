/**
 * Production Neon migrate helper for Studio v8.
 *
 * Refuses localhost. Refuses without explicit confirmation.
 * Does NOT create Neon branches (do that in the Neon console first).
 *
 * Usage:
 *   # 1) Create Neon branch backup in console, verify historical migrations.
 *   # 2) Point DATABASE_URL at Neon Primary (sslmode=require), then:
 *   CONFIRM_STUDIO_MIGRATE=YES BACKUP_BRANCH_NAME=pre-studio-v8-YYYYMMDD \
 *     node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
 *     scripts/studio-prod-migrate.mjs
 *
 * Never prints DATABASE_URL credentials.
 */
import { spawnSync } from "node:child_process";

const EXPECTED = [
  "20261027160411_init_orders",
  "20261027171500_payment_audit",
  "20261027194500_buyer_access",
  "20261103160000_studio_assets",
  "20261103180000_rate_limit_buckets",
  "20261103210000_studio_order_attempts",
  "20261103223000_mail_notifications",
];

const STUDIO = EXPECTED.slice(3);

function classifyDatabaseUrl(raw) {
  if (!raw) return { ok: false, reason: "missing-DATABASE_URL" };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "unparseable-DATABASE_URL" };
  }
  const host = url.hostname;
  if (/^(127\.0\.0\.1|localhost)$/i.test(host)) {
    return { ok: false, reason: "refuses-localhost" };
  }
  if (!/\.neon\.tech$/i.test(host)) {
    return { ok: false, reason: "refuses-non-neon-host" };
  }
  if (/-pooler\./i.test(host)) {
    return { ok: false, reason: "refuses-neon-pooler-use-direct-host" };
  }
  if (!/sslmode=require/i.test(url.search)) {
    return { ok: false, reason: "requires-sslmode-require" };
  }
  return { ok: true, hostClass: "neon-direct", db: url.pathname.replace(/^\//, "") || null };
}

function runPrisma(args) {
  const result = spawnSync("pnpm", ["exec", "prisma", ...args], {
    encoding: "utf8",
    shell: true,
    env: process.env,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const combined = `${stdout}\n${stderr}`
    .replace(/postgresql:\/\/[^@\s]+@/gi, "postgresql://***@")
    .replace(/postgres:\/\/[^@\s]+@/gi, "postgres://***@");
  return { status: result.status ?? 1, output: combined.trim() };
}

function main() {
  const confirm = process.env.CONFIRM_STUDIO_MIGRATE?.trim();
  const backup = process.env.BACKUP_BRANCH_NAME?.trim();
  const classified = classifyDatabaseUrl(process.env.DATABASE_URL ?? "");

  console.log(
    JSON.stringify(
      {
        phase: "preflight",
        database: classified,
        confirmStudioMigrate: confirm === "YES",
        backupBranchNameSet: Boolean(backup),
        expectedMigrations: EXPECTED.length,
        pendingStudioMigrations: STUDIO,
      },
      null,
      2,
    ),
  );

  if (!classified.ok) {
    console.error("ABORT:", classified.reason);
    process.exit(2);
  }
  if (confirm !== "YES") {
    console.error("ABORT: set CONFIRM_STUDIO_MIGRATE=YES after Neon backup branch is verified");
    process.exit(2);
  }
  if (!backup) {
    console.error("ABORT: set BACKUP_BRANCH_NAME to the Neon branch created before migrate");
    process.exit(2);
  }

  console.log("\n--- prisma migrate status (before) ---");
  const before = runPrisma(["migrate", "status"]);
  console.log(before.output);
  if (before.status !== 0 && !before.output.includes("Following migrations have not yet been applied")) {
    // status exits non-zero when pending; that is expected. Abort on connection errors.
    if (/Error|P1001|P1017|denied|refused/i.test(before.output) && !/not yet been applied/i.test(before.output)) {
      console.error("ABORT: migrate status failed");
      process.exit(before.status || 1);
    }
  }

  console.log("\n--- prisma migrate deploy ---");
  const deploy = runPrisma(["migrate", "deploy"]);
  console.log(deploy.output);
  if (deploy.status !== 0) {
    console.error("ABORT: migrate deploy failed — restore from Neon branch", backup);
    process.exit(deploy.status || 1);
  }

  console.log("\n--- prisma migrate status (after) ---");
  const after = runPrisma(["migrate", "status"]);
  console.log(after.output);

  console.log(
    JSON.stringify(
      {
        phase: "done",
        backupBranchName: backup,
        next: [
          "SQL-check StudioAsset RateLimitBucket StudioOrderAttempt MailNotification",
          "Keep STUDIO_CHECKOUT_ENABLED off until smoke + crons OK",
        ],
      },
      null,
      2,
    ),
  );
}

main();
