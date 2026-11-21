import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { canDownloadOrderFiles } from "@/lib/delivery";
import { legalDataComplete, pendingLegalFields } from "@/lib/legal";
import { purchasesAvailable } from "@/lib/payments/availability";
import { studioCheckoutAllowed, studioSalesOpen } from "@/lib/studio/checkout-access";

assert.equal(studioCheckoutAllowed({}), false);
assert.equal(studioCheckoutAllowed({ STUDIO_CHECKOUT_ENABLED: "" }), false);
assert.equal(studioCheckoutAllowed({ STUDIO_CHECKOUT_ENABLED: "0" }), false);
assert.equal(studioCheckoutAllowed({ STUDIO_CHECKOUT_ENABLED: "false" }), false);
assert.equal(studioCheckoutAllowed({ STUDIO_CHECKOUT_ENABLED: "off" }), false);
assert.equal(studioCheckoutAllowed({ NODE_ENV: "development" }), false);
assert.equal(studioCheckoutAllowed({ NODE_ENV: "production" }), false);

assert.equal(studioCheckoutAllowed({ STUDIO_CHECKOUT_ENABLED: "true" }), true);
assert.equal(studioCheckoutAllowed({ STUDIO_CHECKOUT_ENABLED: "1" }), true);
assert.equal(studioCheckoutAllowed({ STUDIO_CHECKOUT_ENABLED: "YES" }), true);
assert.equal(studioCheckoutAllowed({ STUDIO_CHECKOUT_ENABLED: "on" }), true);

// Incomplete legal data does not disable the checkout: sales follow only the commercial switch.
const legalIsIncomplete = !legalDataComplete();
assert.equal(legalIsIncomplete, pendingLegalFields().length > 0);
for (const nodeEnv of ["production", "development", "test"]) {
  assert.equal(studioSalesOpen({ STUDIO_CHECKOUT_ENABLED: "true", NODE_ENV: nodeEnv }), true, nodeEnv);
  assert.equal(studioSalesOpen({ NODE_ENV: nodeEnv }), false, nodeEnv);
}

// Structural guard: no commercial or payment code reads the legal-data state.
function sourceFiles(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => sourceFiles(join(path, name)));
}
const commercialSources = [
  ...sourceFiles("app/api"),
  ...sourceFiles("lib/payments"),
  ...sourceFiles("lib/orders.ts"),
  "lib/studio/checkout-access.ts",
  "lib/studio/export/access.ts",
  "components/sales-aware.tsx",
].filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.ts$/.test(file));
for (const file of commercialSources) {
  const text = readFileSync(file, "utf8");
  assert.equal(/legalDataComplete|pendingLegalFields|isPending\(/.test(text), false, `${file} must not depend on pending legal data`);
}

// Downloads still need a confirmed payment (PAID) or the free first QR (FREE).
assert.equal(canDownloadOrderFiles("PENDING"), false);
assert.equal(canDownloadOrderFiles("CANCELLED"), false);
assert.equal(canDownloadOrderFiles("PAID"), true);
assert.equal(canDownloadOrderFiles("FREE"), true);

// Purchases are offered only when the switch is on AND Mercado Pago is configured (no network is needed to say no).
{
  const saved = { ...process.env };
  try {
    delete process.env.STUDIO_CHECKOUT_ENABLED;
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-test-token";
    process.env.MERCADOPAGO_ENV = "production";
    assert.equal(await purchasesAvailable(), false, "switch off");
    process.env.STUDIO_CHECKOUT_ENABLED = "true";
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    assert.equal(await purchasesAvailable(), false, "switch on but no Mercado Pago credential");
    process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-not-a-production-token";
    assert.equal(await purchasesAvailable(), false, "credential shape does not match the environment");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

console.log("studio checkout-access tests ok");
