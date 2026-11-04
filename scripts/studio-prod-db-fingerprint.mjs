/**
 * Read-only fingerprint of DATABASE_URL for Render/Neon cutover checks.
 * Never prints credentials. Refuses to mutate schema.
 *
 *   DATABASE_URL=… node --experimental-strip-types \
 *     --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
 *     scripts/studio-prod-db-fingerprint.mjs
 */
const raw = process.env.DATABASE_URL ?? "";
if (!raw) {
  console.log(JSON.stringify({ ok: false, reason: "missing-DATABASE_URL" }));
  process.exit(2);
}

let url;
try {
  url = new URL(raw);
} catch {
  console.log(JSON.stringify({ ok: false, reason: "unparseable-DATABASE_URL" }));
  process.exit(2);
}

const host = url.hostname;
const fingerprint = {
  ok: true,
  hostClass: /\.neon\.tech$/i.test(host)
    ? /-pooler\./i.test(host)
      ? "neon-pooler"
      : "neon-direct"
    : /^(127\.0\.0\.1|localhost)$/i.test(host)
      ? "localhost"
      : "other",
  endpointPrefix: host.split(".")[0]?.replace(/-pooler$/i, "") ?? null,
  db: url.pathname.replace(/^\//, "") || null,
  sslmode: url.searchParams.get("sslmode"),
  schemaParam: url.searchParams.get("schema"),
};

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
try {
  const mig = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL`,
  );
  const tables = await prisma.$queryRawUnsafe(`
    SELECT
      to_regclass('"Order"')::text AS order_t,
      to_regclass('"StudioAsset"')::text AS studio_asset,
      to_regclass('"RateLimitBucket"')::text AS rate_limit,
      to_regclass('"StudioOrderAttempt"')::text AS studio_order,
      to_regclass('"MailNotification"')::text AS mail_notification
  `);
  console.log(
    JSON.stringify(
      {
        ...fingerprint,
        finishedMigrations: mig[0]?.n ?? null,
        tables: tables[0] ?? null,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      ...fingerprint,
      queryOk: false,
      prismaCode: error && typeof error === "object" && "code" in error ? error.code : null,
    }),
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
