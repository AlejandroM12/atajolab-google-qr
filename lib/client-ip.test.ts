import assert from "node:assert/strict";
import {
  rateLimitClientKeyFromRequest,
  readRateLimitTrustProxy,
  RATE_LIMIT_UNTRUSTED_KEY,
} from "./client-ip.ts";
import { recoveryClientKey, recoveryClientKeyFromRequest } from "./recovery.ts";
import { studioClientKeyFromRequest } from "./studio/draft-session.ts";

function request(headers: Record<string, string>): Request {
  return new Request("http://localhost:3001/api/test", { method: "POST", headers });
}

{
  assert.equal(readRateLimitTrustProxy({}), "off");
  assert.equal(readRateLimitTrustProxy({ RATE_LIMIT_TRUST_PROXY: "" }), "off");
  assert.equal(readRateLimitTrustProxy({ RATE_LIMIT_TRUST_PROXY: "off" }), "off");
  assert.equal(readRateLimitTrustProxy({ RATE_LIMIT_TRUST_PROXY: "cloudflare" }), "cloudflare");
  assert.equal(readRateLimitTrustProxy({ RATE_LIMIT_TRUST_PROXY: "CF" }), "cloudflare");
}

{
  // Default: all IP headers ignored — spoofing cannot escape the shared bucket.
  const env = { RATE_LIMIT_TRUST_PROXY: "" };
  const bare = rateLimitClientKeyFromRequest(request({}), env);
  assert.equal(bare, RATE_LIMIT_UNTRUSTED_KEY);

  const spoofXff = rateLimitClientKeyFromRequest(
    request({ "x-forwarded-for": "198.51.100.1, 203.0.113.9" }),
    env,
  );
  assert.equal(spoofXff, RATE_LIMIT_UNTRUSTED_KEY);

  const spoofCf = rateLimitClientKeyFromRequest(
    request({
      "cf-connecting-ip": "198.51.100.50",
      "cf-ray": "aaaaaaaaaaaaaaaa-EZE",
      "x-real-ip": "203.0.113.1",
    }),
    env,
  );
  assert.equal(spoofCf, RATE_LIMIT_UNTRUSTED_KEY);
  assert.equal(spoofXff, spoofCf);
}

{
  const env = { RATE_LIMIT_TRUST_PROXY: "cloudflare" };
  const withCf = rateLimitClientKeyFromRequest(
    request({
      "cf-connecting-ip": "203.0.113.10",
      "cf-ray": "8f1a2b3c4d5e6f70-EZE",
      "x-forwarded-for": "198.51.100.1, 203.0.113.10",
      "x-real-ip": "198.51.100.99",
    }),
    env,
  );
  assert.notEqual(withCf, RATE_LIMIT_UNTRUSTED_KEY);

  // Same client IP → same key; XFF/X-Real-IP must not change it.
  const again = rateLimitClientKeyFromRequest(
    request({
      "cf-connecting-ip": "203.0.113.10",
      "cf-ray": "other-ray-value1-EZE",
    }),
    env,
  );
  assert.equal(again, withCf);

  // Different CF-Connecting-IP → different key.
  const other = rateLimitClientKeyFromRequest(
    request({
      "cf-connecting-ip": "203.0.113.11",
      "cf-ray": "8f1a2b3c4d5e6f70-EZE",
    }),
    env,
  );
  assert.notEqual(other, withCf);

  // CF-Connecting-IP without CF-Ray → untrusted (incomplete proxy signal).
  assert.equal(
    rateLimitClientKeyFromRequest(request({ "cf-connecting-ip": "203.0.113.10" }), env),
    RATE_LIMIT_UNTRUSTED_KEY,
  );

  // XFF / X-Real-IP alone never trusted, even in cloudflare mode.
  assert.equal(
    rateLimitClientKeyFromRequest(request({ "x-forwarded-for": "203.0.113.10" }), env),
    RATE_LIMIT_UNTRUSTED_KEY,
  );
  assert.equal(
    rateLimitClientKeyFromRequest(request({ "x-real-ip": "203.0.113.10" }), env),
    RATE_LIMIT_UNTRUSTED_KEY,
  );

  // Comma / garbage CF-Connecting-IP rejected.
  assert.equal(
    rateLimitClientKeyFromRequest(
      request({ "cf-connecting-ip": "203.0.113.10, 198.51.100.1", "cf-ray": "8f1a2b3c4d5e6f70-EZE" }),
      env,
    ),
    RATE_LIMIT_UNTRUSTED_KEY,
  );
}

{
  // Studio + recovery wrappers share the same policy.
  const env = { RATE_LIMIT_TRUST_PROXY: "" };
  const req = request({ "x-forwarded-for": "198.51.100.1", "cf-connecting-ip": "203.0.113.10" });
  assert.equal(studioClientKeyFromRequest(req, env), RATE_LIMIT_UNTRUSTED_KEY);
  assert.equal(recoveryClientKeyFromRequest(req, env), RATE_LIMIT_UNTRUSTED_KEY);
  assert.equal(recoveryClientKey("198.51.100.1, 203.0.113.9"), RATE_LIMIT_UNTRUSTED_KEY);
}

{
  const env = { RATE_LIMIT_TRUST_PROXY: "cloudflare" };
  const req = request({
    "cf-connecting-ip": "203.0.113.44",
    "cf-ray": "bbbbbbbbbbbbbbbb-EZE",
  });
  assert.equal(studioClientKeyFromRequest(req, env), recoveryClientKeyFromRequest(req, env));
  assert.notEqual(studioClientKeyFromRequest(req, env), RATE_LIMIT_UNTRUSTED_KEY);
}

console.log("client-ip checks passed");
