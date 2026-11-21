import assert from "node:assert/strict";
import { accessConfirmationPage, isAccessTokenShape } from "./access-page.ts";
import { createAccessToken } from "./access-link.ts";
import { parseClientErrorReport } from "./client-error.ts";
import { BodyTooLargeError, readBodyBytes, readBodyText, readJsonBody } from "./http/body.ts";
import { isPending, legal, legalDataComplete, pendingLegalFields, supportMailbox } from "./legal.ts";
import { describeError, scrub } from "./log.ts";
import { contentSecurityPolicy, securityHeaders } from "./security-headers.ts";
import { homeStructuredData, jsonLd, PUBLIC_PATHS, siteUrl } from "./site.ts";
import { parseWithdrawalBody, withdrawalCode, withdrawalMails } from "./withdrawal.ts";
import { assertDatabaseTarget, checkDatabaseTarget } from "./db-guard.ts";
import { isGoogleBusinessShareLink } from "./google-link.ts";
import { isGoogleQrLink } from "./studio/export/validate.ts";
import { studioSalesOpen } from "./studio/checkout-access.ts";
import { rateLimitClientKeyFromRequest, RATE_LIMIT_UNTRUSTED_KEY } from "./client-ip.ts";
import { createHash } from "node:crypto";

// --- A developer machine never writes to a remote (production) database ---------------
{
  const neon = "postgresql://u:p@ep-x.sa-east-1.aws.neon.tech/neondb?sslmode=require";
  assert.deepEqual(checkDatabaseTarget({ DATABASE_URL: neon }), { ok: false, host: "ep-x.sa-east-1.aws.neon.tech" });
  assert.deepEqual(checkDatabaseTarget({ DATABASE_URL: neon, NODE_ENV: "development" }).ok, false);
  assert.throws(() => assertDatabaseTarget({ DATABASE_URL: neon }), /ALLOW_REMOTE_DATABASE/);
  assert.equal(checkDatabaseTarget({ DATABASE_URL: neon, RENDER: "true" }).ok, true);
  assert.equal(checkDatabaseTarget({ DATABASE_URL: neon, ALLOW_REMOTE_DATABASE: "1" }).ok, true);
  assert.equal(checkDatabaseTarget({ DATABASE_URL: neon, NEXT_PHASE: "phase-production-build" }).ok, true);
  assert.equal(checkDatabaseTarget({ DATABASE_URL: neon, RENDER: "1" }).ok, false);
  assert.equal(checkDatabaseTarget({ DATABASE_URL: "postgresql://a:b@127.0.0.1:54329/x" }).ok, true);
  assert.equal(checkDatabaseTarget({ DATABASE_URL: "postgresql://a:b@localhost:5432/x" }).ok, true);
  assert.equal(checkDatabaseTarget({}).ok, true);
}

// --- Google links real businesses share must pass the Studio QR gate ---------------------
{
  const accepted = [
    "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4",
    "https://g.page/r/CQpXgZ1aBcDeEAE/review",
    "https://g.page/r/CQpXgZ1aBcDeEAE",
    "https://g.page/cafe-centro",
    "https://maps.app.goo.gl/Ab3dEf9GhJkLmN1o8",
    "https://maps.app.goo.gl/Ab3dEf9GhJkLmN1o8?g_st=iw",
    "https://goo.gl/maps/AbCdEf123456",
    "https://www.google.com/maps/place/Caf%C3%A9+Centro/@-34.6037,-58.3816,17z/data=!3m1!4b1",
    "https://www.google.com.ar/maps/place/Caf%C3%A9+Centro/@-34.6,-58.4,17z",
    "https://maps.google.com/?cid=1234567890123456789",
    "https://www.google.com/maps/search/?api=1&query=Cafe&query_place_id=ChIJN1t_tDeuEmsRUsoyG83frY4",
    "https://g.co/kgs/AbC1dE2",
    "https://www.google.com/search?q=cafe+centro#lrd=0x95bccacf1d2b3a8b:0x1234567890abcdef,3,,,",
    "https://www.google.com.ar/search?q=cafe&kgmid=/g/11abc_def1",
  ];
  for (const url of accepted) assert.equal(isGoogleQrLink(url), true, url);

  const rejected = [
    "http://maps.app.goo.gl/Ab3dEf9GhJkLmN1o8",
    "https://example.com/promo",
    "https://google.com.evil.example/maps/place/x",
    "https://wa.me/5491112345678",
    "https://g.co/evil",
    "https://g.co/kgs/../../x",
    "https://user@g.co/kgs/AbC1dE2",
    "https://www.google.com/search?q=gratis",
    "https://www.google.com/search?q=x#lrd=nope",
    "https://evil.example/search?q=x#lrd=0x1:0x2,3",
  ];
  for (const url of rejected) assert.equal(isGoogleQrLink(url), false, url);
  assert.equal(isGoogleBusinessShareLink("https://g.page/r/CQpXgZ1aBcDeEAE/review"), false);
}

// --- Sales follow only the commercial switch, never the seller's legal data ----------------
{
  const on = { STUDIO_CHECKOUT_ENABLED: "true", STUDIO_SALES_CONFIRMED: "true" };
  assert.equal(studioSalesOpen({ ...on, NODE_ENV: "production" }), true);
  assert.equal(studioSalesOpen({ ...on, NODE_ENV: "development" }), true);
  assert.equal(studioSalesOpen({ NODE_ENV: "production" }), false);
  // The checkout switch alone is not enough: the operator confirms the go-live separately.
  assert.equal(studioSalesOpen({ STUDIO_CHECKOUT_ENABLED: "true", NODE_ENV: "production" }), false);
  assert.equal(studioSalesOpen({ STUDIO_SALES_CONFIRMED: "true", NODE_ENV: "production" }), false);
}

// --- Rate-limit keys: keyed hash, and spoofed headers cannot move the bucket -------------
{
  const req = (xff: string) => new Request("http://localhost/x", { headers: { "x-forwarded-for": xff } });
  const env = { RATE_LIMIT_TRUST_PROXY: "xff", ORDER_ACCESS_SECRET: "s".repeat(40) };
  const real = rateLimitClientKeyFromRequest(req("203.0.113.10"), env);
  // Not the plain SHA-256 of the address (reversible by brute force over IPv4).
  assert.notEqual(real, createHash("sha256").update("203.0.113.10").digest("hex").slice(0, 32));
  // Different server secret, different key.
  assert.notEqual(real, rateLimitClientKeyFromRequest(req("203.0.113.10"), { ...env, ORDER_ACCESS_SECRET: "t".repeat(40) }));
  // Anything the client prepends is ignored.
  for (const forged of ["1.1.1.1, 203.0.113.10", "9.9.9.9,8.8.8.8, 203.0.113.10", "garbage, 203.0.113.10"]) {
    assert.equal(rateLimitClientKeyFromRequest(req(forged), env), real, forged);
  }
  // A forged value alone (no proxy entry) only lands in the attacker's own bucket.
  assert.notEqual(rateLimitClientKeyFromRequest(req("1.1.1.1"), env), RATE_LIMIT_UNTRUSTED_KEY);
}

// --- Body readers stop at the cap while streaming --------------------------------
{
  const small = new Request("http://localhost/x", { method: "POST", body: "hola" });
  assert.equal(await readBodyText(small, 10), "hola");

  const declared = new Request("http://localhost/x", {
    method: "POST",
    body: "x".repeat(50),
    headers: { "content-length": "50" },
  });
  await assert.rejects(readBodyBytes(declared, 10), BodyTooLargeError);

  // Chunked body without Content-Length.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 0; index < 5; index += 1) controller.enqueue(new Uint8Array(1000));
      controller.close();
    },
  });
  const chunked = new Request("http://localhost/x", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  await assert.rejects(readBodyBytes(chunked, 2500), BodyTooLargeError);

  const json = new Request("http://localhost/x", {
    method: "POST",
    body: JSON.stringify({ a: 1 }),
    headers: { "content-type": "application/json" },
  });
  assert.deepEqual(await readJsonBody(json, 100), { a: 1 });
  const notJson = new Request("http://localhost/x", { method: "POST", body: "{}", headers: { "content-type": "text/plain" } });
  assert.equal(await readJsonBody(notJson, 100), undefined);
  const broken = new Request("http://localhost/x", {
    method: "POST",
    body: "{nope",
    headers: { "content-type": "application/json" },
  });
  assert.equal(await readJsonBody(broken, 100), undefined);
}

// --- Logs never carry emails or tokens -------------------------------------------
{
  const cleaned = scrub(
    "fallo para cliente@example.com con Bearer abc.def y APP_USR-1234-5678 token aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
  assert.equal(cleaned.includes("cliente@example.com"), false);
  assert.equal(cleaned.includes("abc.def"), false);
  assert.equal(cleaned.includes("APP_USR-1234"), false);
  assert.equal(cleaned.includes("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), false);
  assert.ok(scrub("x".repeat(1000)).length <= 401);

  const error = Object.assign(new Error("db down for persona@example.com"), { code: "P1001" });
  const described = describeError(error);
  assert.equal(described.errorName, "Error");
  assert.equal(described.errorCode, "P1001");
  assert.equal(described.errorMessage.includes("persona@example.com"), false);
  assert.equal(describeError("texto").errorName, "unknown");

  // Prisma validation errors print the query arguments: only the first line survives.
  const prismaError = new Error(
    "\nInvalid `prisma.order.create()` invocation:\n{\n  data: { buyerEmail: \"x@y.com\", artwork: { title: \"Mi negocio\" } }\n}",
  );
  prismaError.name = "PrismaClientValidationError";
  const prismaLog = describeError(prismaError);
  assert.equal(prismaLog.errorMessage.includes("Mi negocio"), false);
  assert.match(prismaLog.errorMessage, /Invalid `prisma.order.create\(\)` invocation/);
}

// --- Security headers ---------------------------------------------------------------
{
  const prod = contentSecurityPolicy({ production: true, analytics: false });
  assert.match(prod, /frame-ancestors 'none'/);
  assert.match(prod, /object-src 'none'/);
  assert.match(prod, /form-action 'self'/);
  assert.match(prod, /upgrade-insecure-requests/);
  assert.equal(prod.includes("unsafe-eval"), false);
  assert.equal(prod.includes("plausible.io"), false);

  const dev = contentSecurityPolicy({ production: false, analytics: true });
  assert.match(dev, /unsafe-eval/);
  assert.equal(dev.includes("upgrade-insecure-requests"), false);
  assert.match(dev, /script-src [^;]*https:\/\/plausible\.io/);
  assert.match(dev, /connect-src [^;]*https:\/\/plausible\.io/);

  const keys = (production: boolean) => securityHeaders({ production }).map((header) => header.key);
  assert.ok(keys(true).includes("Strict-Transport-Security"));
  assert.equal(keys(false).includes("Strict-Transport-Security"), false);
  assert.ok(keys(true).includes("X-Content-Type-Options"));
  assert.ok(keys(true).includes("X-Frame-Options"));
  // A production build served over plain http (local smoke test) must not force https.
  assert.equal(securityHeaders({ production: true, https: false }).some((h) => h.key === "Strict-Transport-Security"), false);
  assert.equal(contentSecurityPolicy({ production: true, https: false }).includes("upgrade-insecure-requests"), false);
}

// --- One-time access page never redeems by itself --------------------------------------
{
  const token = createAccessToken();
  assert.equal(isAccessTokenShape(token), true);
  assert.equal(isAccessTokenShape("../../etc/passwd"), false);
  assert.equal(isAccessTokenShape('"><script>'), false);
  const html = accessConfirmationPage(token);
  assert.match(html, /<form method="post" action="\/acceso\//);
  assert.match(html, /noindex/);
  assert.throws(() => accessConfirmationPage("<script>"));
}

// --- Withdrawal ("botón de arrepentimiento") ------------------------------------------
{
  assert.deepEqual(parseWithdrawalBody({ email: "mal" }), { ok: false, error: "invalid-email" });
  assert.deepEqual(parseWithdrawalBody({ email: "a@example.com", publicId: "corto" }), {
    ok: false,
    error: "invalid-order",
  });
  assert.deepEqual(parseWithdrawalBody({ email: "a@example.com", extra: 1 }), { ok: false, error: "invalid-body" });
  assert.deepEqual(parseWithdrawalBody({ email: "a@example.com", reason: "x".repeat(1001) }), {
    ok: false,
    error: "reason-too-long",
  });
  const parsed = parseWithdrawalBody({
    email: " Cliente@Example.com ",
    publicId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    reason: "No lo necesito\u0007",
  });
  assert.ok(parsed.ok);
  if (!parsed.ok) throw new Error("parse");
  assert.equal(parsed.request.email, "cliente@example.com");
  assert.equal(parsed.request.reason, "No lo necesito");

  const code = withdrawalCode();
  assert.match(code, /^ARR-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.notEqual(withdrawalCode(), code);

  const mails = withdrawalMails({
    request: parsed.request,
    code,
    receivedAt: new Date("2026-11-04T15:00:00Z"),
    supportMailbox: "soporte@example.com",
    tradeName: "AtajoLab",
  });
  assert.equal(mails.toSupport.to, "soporte@example.com");
  assert.equal(mails.toBuyer.to, "cliente@example.com");
  assert.ok(mails.toSupport.text.includes(code));
  assert.ok(mails.toBuyer.subject.includes(code));
}

// --- Browser error reports are trimmed and anonymized --------------------------------------
{
  const report = parseClientErrorReport({
    digest: "123",
    message: "boom",
    path: "/pedido/aaaaaaaaaaaaaaaaaaaaaaaa?payment_id=999",
    boundary: "global",
  });
  assert.deepEqual(report, { digest: "123", message: "boom", path: "/pedido/:id", boundary: "global" });
  assert.equal(parseClientErrorReport("nope"), null);
  assert.equal(parseClientErrorReport({ path: "https://evil.example" })?.path, "");
}

// --- Legal placeholders are visible, never silently "complete" -----------------------------
{
  assert.equal(isPending("[COMPLETAR: CUIT]"), true);
  assert.equal(isPending("20-12345678-9"), false);
  // The repository ships placeholders: launch checklist must flag them.
  assert.equal(legalDataComplete(), pendingLegalFields().length === 0);
  if (isPending(legal.supportEmail)) assert.equal(supportMailbox(), null);
  else assert.equal(supportMailbox(), legal.supportEmail);

  // Every placeholder lives in lib/legal.ts, so the sales gate sees all of them.
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const stray: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && readFileSync(path, "utf8").includes("[COMPLETAR")) stray.push(path);
    }
  };
  walk(join(root, "app"));
  walk(join(root, "components"));
  assert.deepEqual(stray, [], "placeholders must be defined in lib/legal.ts");
}

// --- SEO helpers ----------------------------------------------------------------------
{
  assert.equal(siteUrl({ APP_URL: "https://qr.example.com/" }).href, "https://qr.example.com/");
  assert.equal(siteUrl({ APP_URL: "javascript:alert(1)" }).href, "https://qr.atajolab.dev/");
  assert.equal(siteUrl({}).href, "https://qr.atajolab.dev/");
  assert.equal(PUBLIC_PATHS.some((path) => path.startsWith("/pedido") || path.startsWith("/acceso")), false);
  const data = jsonLd(homeStructuredData(new URL("https://qr.example.com"), { salesOpen: true }));
  assert.equal(data.includes("</script>"), false);
  assert.ok(data.includes('"priceCurrency":"ARS"'));
  // A price is published only while it can be paid.
  const closed = jsonLd(homeStructuredData(new URL("https://qr.example.com")));
  assert.equal(closed.includes('"price"'), false);
  assert.equal(closed.includes('"Offer"'), false);
  assert.equal(jsonLd({ x: "</script><script>" }).includes("</script>"), false);
}

console.log("platform checks passed");
