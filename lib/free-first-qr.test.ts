import assert from "node:assert/strict";
import { canDownloadOrderFiles, orderDeliverable } from "./delivery.ts";
import {
  canonicalFreeEmail,
  createVisitorKey,
  FREE_FIRST_QR_COOKIE,
  freeFirstQrBuckets,
  freeFirstQrDailyLimit,
  freeFirstQrOpen,
  hashFreeEmail,
  hashVisitorKey,
  readVisitorKey,
  visitorCookie,
} from "./free-first-qr.ts";
import { createDeliveryKey, digitalDeliveryAllowed, hashDeliveryKey } from "./payments/access.ts";
import { paymentView } from "./payments/checkout-policy.ts";
import { decidePayment } from "./payments/decision.ts";
import { recoveryTargets } from "./recovery.ts";

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

// Server switch: off unless explicitly on; production also needs complete seller data.
assert.equal(freeFirstQrOpen(env({}), true), false);
assert.equal(freeFirstQrOpen(env({ FREE_FIRST_QR_ENABLED: "false" }), true), false);
assert.equal(freeFirstQrOpen(env({ FREE_FIRST_QR_ENABLED: "true" }), true), true);
assert.equal(freeFirstQrOpen(env({ FREE_FIRST_QR_ENABLED: "on", NODE_ENV: "development" }), false), true);
assert.equal(freeFirstQrOpen(env({ FREE_FIRST_QR_ENABLED: "true", NODE_ENV: "production" }), false), false);
assert.equal(freeFirstQrOpen(env({ FREE_FIRST_QR_ENABLED: "true", NODE_ENV: "production" }), true), true);

// Daily cap and per-IP buckets.
assert.equal(freeFirstQrDailyLimit(env({})), 100);
assert.equal(freeFirstQrDailyLimit(env({ FREE_FIRST_QR_DAILY_LIMIT: "25" })), 25);
assert.equal(freeFirstQrDailyLimit(env({ FREE_FIRST_QR_DAILY_LIMIT: "-1" })), 100);
const buckets = freeFirstQrBuckets("abc", env({ FREE_FIRST_QR_DAILY_LIMIT: "10" }));
assert.deepEqual(
  buckets.map((bucket) => [bucket.key, bucket.limit]),
  [
    ["free-first:ip:abc", 3],
    ["free-first:global", 10],
  ],
);

// Visitor cookie: random, HttpOnly, only well-formed values are read back.
const visitor = createVisitorKey();
assert.notEqual(visitor, createVisitorKey());
const cookie = visitorCookie(visitor, true);
assert.match(cookie, new RegExp(`^${FREE_FIRST_QR_COOKIE}=`));
assert.match(cookie, /HttpOnly/);
assert.match(cookie, /Secure/);
assert.match(cookie, /SameSite=Lax/);
assert.equal(readVisitorKey(`a=1; ${FREE_FIRST_QR_COOKIE}=${visitor}`), visitor);
assert.equal(readVisitorKey(`${FREE_FIRST_QR_COOKIE}=short`), null);
assert.equal(readVisitorKey(null), null);
assert.notEqual(hashVisitorKey(visitor), visitor);

// One inbox counts once: +tags and Gmail dots collapse.
assert.equal(canonicalFreeEmail("ana.perez+promo@gmail.com"), "anaperez@gmail.com");
assert.equal(canonicalFreeEmail("ana.perez@googlemail.com"), "anaperez@gmail.com");
assert.equal(canonicalFreeEmail("ana.perez+x@empresa.com.ar"), "ana.perez@empresa.com.ar");
assert.equal(hashFreeEmail("a.b+1@gmail.com"), hashFreeEmail("ab@gmail.com"));
assert.notEqual(hashFreeEmail("ab@gmail.com"), hashFreeEmail("ab@empresa.com"));
assert.equal(hashFreeEmail("ab@gmail.com").includes("ab"), false);

// FREE delivers like PAID; PENDING and CANCELLED do not.
assert.equal(orderDeliverable("FREE"), true);
assert.equal(orderDeliverable("PAID"), true);
assert.equal(orderDeliverable("PENDING"), false);
assert.equal(canDownloadOrderFiles("FREE"), true);
assert.equal(canDownloadOrderFiles("CANCELLED"), false);
const key = createDeliveryKey();
assert.equal(
  digitalDeliveryAllowed({ downloadsEnabled: true, status: "FREE", key, storedHash: hashDeliveryKey(key) }),
  true,
);
assert.equal(
  digitalDeliveryAllowed({ downloadsEnabled: true, status: "FREE", key: null, storedHash: hashDeliveryKey(key) }),
  false,
);
assert.equal(
  digitalDeliveryAllowed({
    downloadsEnabled: true,
    status: "FREE",
    key: createDeliveryKey(),
    storedHash: hashDeliveryKey(key),
  }),
  false,
);
assert.equal(paymentView({ orderStatus: "FREE", hint: null, externalStatus: null }), "approved");

// Recovery by email also covers free orders.
assert.equal(
  recoveryTargets("a@b.com", [{ publicId: "x", status: "FREE", buyerEmail: "a@b.com", label: "QR" }]).length,
  1,
);

// A payment notification can never change a FREE order, even with a catalog amount.
const ignored = decidePayment(
  { publicId: "AbCdEfGhIjKlMnOpQrStUvWx", status: "FREE", amountArs: 4900, currency: "ARS", paymentId: null },
  {
    id: "1",
    status: "approved",
    amount: 4900,
    currency: "ARS",
    externalReference: "AbCdEfGhIjKlMnOpQrStUvWx",
    liveMode: false,
    approvedAt: new Date().toISOString(),
    parties: "verified-test-users",
    collectorId: null,
    accountId: null,
  },
  new Date(),
  "test",
);
assert.deepEqual(ignored, { action: "ignore", reason: "order-closed" });

console.log("free-first-qr checks passed");
