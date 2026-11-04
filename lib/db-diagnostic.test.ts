import assert from "node:assert/strict";
import {
  classifyDatabaseUrlFingerprint,
  collectDbDiagnostic,
  dbDiagnosticAuthorized,
  EXPECTED_DB_NAME,
  EXPECTED_NEON_ENDPOINT_PREFIX,
} from "./db-diagnostic.ts";

{
  const secret = "d".repeat(32);
  assert.equal(dbDiagnosticAuthorized(null, { DB_DIAGNOSTIC_SECRET: secret }), false);
  assert.equal(dbDiagnosticAuthorized("Bearer short", { DB_DIAGNOSTIC_SECRET: secret }), false);
  assert.equal(
    dbDiagnosticAuthorized(`Bearer ${"x".repeat(32)}`, { DB_DIAGNOSTIC_SECRET: secret }),
    false,
  );
  assert.equal(
    dbDiagnosticAuthorized(`Bearer ${secret}`, { DB_DIAGNOSTIC_SECRET: secret }),
    true,
  );
  assert.equal(
    dbDiagnosticAuthorized(secret, { DB_DIAGNOSTIC_SECRET: secret }),
    true,
  );
  assert.equal(
    dbDiagnosticAuthorized(`Bearer ${secret}`, { DB_DIAGNOSTIC_SECRET: "s".repeat(16) }),
    false,
  );
}

{
  const pooler = classifyDatabaseUrlFingerprint(
    `postgresql://u:p@${EXPECTED_NEON_ENDPOINT_PREFIX}-pooler.c-2.sa-east-1.aws.neon.tech/${EXPECTED_DB_NAME}?sslmode=require`,
  );
  assert.equal(pooler.hostClass, "neon-pooler");
  assert.equal(pooler.endpointMatch, true);
  assert.equal(pooler.dbMatch, true);

  const direct = classifyDatabaseUrlFingerprint(
    `postgresql://u:p@${EXPECTED_NEON_ENDPOINT_PREFIX}.c-2.sa-east-1.aws.neon.tech/${EXPECTED_DB_NAME}?sslmode=require`,
  );
  assert.equal(direct.hostClass, "neon-direct");
  assert.equal(direct.endpointMatch, true);

  const other = classifyDatabaseUrlFingerprint(
    "postgresql://u:p@ep-other-endpoint-xxxx.aws.neon.tech/neondb?sslmode=require",
  );
  assert.equal(other.endpointMatch, false);

  const wrongDb = classifyDatabaseUrlFingerprint(
    `postgresql://u:p@${EXPECTED_NEON_ENDPOINT_PREFIX}.aws.neon.tech/otherdb?sslmode=require`,
  );
  assert.equal(wrongDb.dbMatch, false);

  assert.equal(classifyDatabaseUrlFingerprint(undefined).hostClass, "missing-url");
}

{
  const client = {
    async $queryRawUnsafe(sql: string) {
      if (sql.includes("current_database")) {
        return [{ db: "neondb", schema: "public", search_path: '"$user", public' }];
      }
      if (sql.includes("_prisma_migrations")) {
        return [{ n: 7 }];
      }
      if (sql.includes("to_regclass")) {
        return [
          {
            studio_asset: '"StudioAsset"',
            rate_limit: '"RateLimitBucket"',
            mail_notification: '"MailNotification"',
          },
        ];
      }
      throw new Error(`unexpected sql: ${sql.slice(0, 40)}`);
    },
    mailNotification: {
      async count() {
        return 0;
      },
    },
    rateLimitBucket: {
      async count() {
        return 0;
      },
    },
  };

  const ok = await collectDbDiagnostic({
    databaseUrl: `postgresql://u:p@${EXPECTED_NEON_ENDPOINT_PREFIX}-pooler.c-2.sa-east-1.aws.neon.tech/neondb?sslmode=require`,
    client,
  });
  assert.equal(ok.hostClass, "neon-pooler");
  assert.equal(ok.endpointMatch, true);
  assert.equal(ok.dbMatch, true);
  assert.equal(ok.schema, "public");
  assert.equal(ok.finishedMigrations, 7);
  assert.equal(ok.tables.MailNotification, true);
  assert.equal(ok.tables.StudioAsset, true);
  assert.equal(ok.tables.RateLimitBucket, true);
  assert.equal(ok.mailNotificationCount, 0);
  assert.equal(ok.rateLimitBucketCount, 0);
  assert.equal(ok.errors.length, 0);
  assert.equal(JSON.stringify(ok).includes("postgresql://"), false);
  assert.equal(JSON.stringify(ok).includes("neon.tech"), false);
}

{
  const missing = await collectDbDiagnostic({
    databaseUrl: `postgresql://u:p@${EXPECTED_NEON_ENDPOINT_PREFIX}.c-2.sa-east-1.aws.neon.tech/neondb?sslmode=require`,
    client: {
      async $queryRawUnsafe(sql: string) {
        if (sql.includes("current_database")) {
          return [{ db: "neondb", schema: "public", search_path: "public" }];
        }
        if (sql.includes("_prisma_migrations")) {
          return [{ n: 3 }];
        }
        if (sql.includes("to_regclass")) {
          return [{ studio_asset: null, rate_limit: null, mail_notification: null }];
        }
        throw new Error("unexpected");
      },
      mailNotification: {
        async count() {
          throw Object.assign(new Error("missing"), {
            code: "P2021",
            meta: { table: "public.MailNotification" },
          });
        },
      },
      rateLimitBucket: {
        async count() {
          throw Object.assign(new Error("missing"), {
            code: "P2021",
            meta: { table: "public.RateLimitBucket" },
          });
        },
      },
    },
  });
  assert.equal(missing.tables.MailNotification, false);
  assert.equal(missing.finishedMigrations, 3);
  assert.equal(missing.mailNotificationCount, null);
  assert.equal(missing.errors.some((e) => e.code === "P2021" && e.op === "mailNotification.count"), true);
  assert.equal(missing.errors.some((e) => e.table === "public.RateLimitBucket"), true);
}

console.log("db-diagnostic checks passed");
