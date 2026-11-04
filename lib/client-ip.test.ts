import assert from "node:assert/strict";
import {
  rateLimitClientKeyFromRequest,
  readProxyHops,
  readRateLimitTrustProxy,
  RATE_LIMIT_UNTRUSTED_KEY,
  trustedForwardedAddress,
} from "./client-ip.ts";
import { ipScopedLimit, UNTRUSTED_IP_MULTIPLIER } from "./rate-limit/policies.ts";
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

{
  // xff mode (Render load balancer / Caddy): the proxy appends the real address.
  assert.equal(readRateLimitTrustProxy({ RATE_LIMIT_TRUST_PROXY: "xff" }), "xff");
  assert.equal(readRateLimitTrustProxy({ RATE_LIMIT_TRUST_PROXY: "render" }), "xff");
  const env = { RATE_LIMIT_TRUST_PROXY: "xff" };

  const a = rateLimitClientKeyFromRequest(request({ "x-forwarded-for": "203.0.113.10" }), env);
  const b = rateLimitClientKeyFromRequest(request({ "x-forwarded-for": "203.0.113.11" }), env);
  assert.notEqual(a, RATE_LIMIT_UNTRUSTED_KEY);
  assert.notEqual(a, b);

  // A spoofed leftmost entry cannot mint a new bucket: the rightmost one wins.
  const spoofed = rateLimitClientKeyFromRequest(
    request({ "x-forwarded-for": "198.51.100.77, 203.0.113.10" }),
    env,
  );
  assert.equal(spoofed, a);
  const spoofedAgain = rateLimitClientKeyFromRequest(
    request({ "x-forwarded-for": "192.0.2.1, 198.51.100.1, 203.0.113.10" }),
    env,
  );
  assert.equal(spoofedAgain, a);

  // Ports and brackets are normalized.
  assert.equal(rateLimitClientKeyFromRequest(request({ "x-forwarded-for": "203.0.113.10:5555" }), env), a);
  assert.notEqual(
    rateLimitClientKeyFromRequest(request({ "x-forwarded-for": "[2001:db8::1]:443" }), env),
    RATE_LIMIT_UNTRUSTED_KEY,
  );

  // Missing or garbage header → shared key.
  assert.equal(rateLimitClientKeyFromRequest(request({}), env), RATE_LIMIT_UNTRUSTED_KEY);
  assert.equal(
    rateLimitClientKeyFromRequest(request({ "x-forwarded-for": "not-an-ip" }), env),
    RATE_LIMIT_UNTRUSTED_KEY,
  );

  // Two trusted hops (e.g. CDN + load balancer): second entry from the right.
  const twoHops = { RATE_LIMIT_TRUST_PROXY: "xff", RATE_LIMIT_PROXY_HOPS: "2" };
  assert.equal(
    rateLimitClientKeyFromRequest(request({ "x-forwarded-for": "198.51.100.77, 203.0.113.10, 10.0.0.1" }), twoHops),
    a,
  );
  assert.equal(
    rateLimitClientKeyFromRequest(request({ "x-forwarded-for": "203.0.113.10" }), twoHops),
    RATE_LIMIT_UNTRUSTED_KEY,
  );
  assert.equal(trustedForwardedAddress("1.1.1.1, 2.2.2.2", 1), "2.2.2.2");
  assert.equal(readProxyHops({ RATE_LIMIT_PROXY_HOPS: "0" }), 1);
  assert.equal(readProxyHops({ RATE_LIMIT_PROXY_HOPS: "99" }), 5);
}

{
  assert.equal(ipScopedLimit(10, RATE_LIMIT_UNTRUSTED_KEY), 10 * UNTRUSTED_IP_MULTIPLIER);
  assert.equal(ipScopedLimit(10, "abc123"), 10);
}

console.log("client-ip checks passed");
