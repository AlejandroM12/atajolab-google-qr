import { createHash, randomBytes } from "node:crypto";
import { ipScopedLimit, type Bucket } from "@/lib/rate-limit/policies";
import { standbyHost } from "@/lib/standby-host";

/**
 * "Tu primer QR es gratis": one free Studio v8 order per browser and per email.
 *
 * The browser is identified by an HttpOnly random cookie (not a person). The
 * database enforces the limit with unique keys on FreeQrClaim, so concurrent or
 * scripted requests cannot get a second free order for the same cookie or email.
 */

export const FREE_FIRST_QR_COOKIE = "atajo_visitante";
const VISITOR_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VISITOR_MAX_AGE_SEC = 60 * 60 * 24 * 365;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Free claims allowed per client IP per day (scaled up when the IP is not trusted). */
export const FREE_FIRST_QR_IP_LIMIT = { limit: 3, windowMs: DAY_MS } as const;
const DEFAULT_DAILY_LIMIT = 100;

function flagOn(value: string | undefined): boolean {
  const flag = (value ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes" || flag === "on";
}

/**
 * Server switch: FREE_FIRST_QR_ENABLED=true. Independent of lib/legal.ts by the
 * owner's decision; sales keep their own seller-data rule (studioSalesOpen).
 */
export function freeFirstQrOpen(env: NodeJS.ProcessEnv = process.env): boolean {
  if (standbyHost(env)) return false;
  return flagOn(env.FREE_FIRST_QR_ENABLED);
}

/** Site-wide daily cap of free orders (FREE_FIRST_QR_DAILY_LIMIT, default 100). */
export function freeFirstQrDailyLimit(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseInt((env.FREE_FIRST_QR_DAILY_LIMIT ?? "").trim(), 10);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 10_000) : DEFAULT_DAILY_LIMIT;
}

export function freeFirstQrBuckets(clientKey: string, env: NodeJS.ProcessEnv = process.env): Bucket[] {
  return [
    {
      key: `free-first:ip:${clientKey}`,
      limit: ipScopedLimit(FREE_FIRST_QR_IP_LIMIT.limit, clientKey),
      windowMs: FREE_FIRST_QR_IP_LIMIT.windowMs,
    },
    { key: "free-first:global", limit: freeFirstQrDailyLimit(env), windowMs: DAY_MS },
  ];
}

export function createVisitorKey(): string {
  return randomBytes(32).toString("base64url");
}

export function isVisitorKey(value: string): boolean {
  return VISITOR_KEY_PATTERN.test(value);
}

export function hashVisitorKey(key: string): string {
  return createHash("sha256").update(`atajolab-visitor:${key}`).digest("hex");
}

export function readVisitorKey(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const prefix = `${FREE_FIRST_QR_COOKIE}=`;
  for (const part of cookieHeader.split(";")) {
    const value = part.trim();
    if (!value.startsWith(prefix)) continue;
    const key = decodeURIComponent(value.slice(prefix.length));
    return isVisitorKey(key) ? key : null;
  }
  return null;
}

export function visitorCookie(key: string, secure: boolean): string {
  const parts = [
    `${FREE_FIRST_QR_COOKIE}=${key}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${VISITOR_MAX_AGE_SEC}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

const DOTLESS_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * Collapses common aliases (+tag, Gmail dots) so one inbox counts once.
 * Input is an already-validated, lowercased buyer email.
 */
export function canonicalFreeEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (DOTLESS_DOMAINS.has(domain)) {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
}

export function hashFreeEmail(email: string): string {
  return createHash("sha256").update(`atajolab-free-email:${canonicalFreeEmail(email)}`).digest("hex");
}
