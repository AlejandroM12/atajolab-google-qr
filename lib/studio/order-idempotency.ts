import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Opaque client idempotency key for one logical Studio purchase attempt. */
export function createStudioOrderIdempotencyKey(): string {
  return randomBytes(32).toString("base64url");
}

export function isStudioOrderIdempotencyKey(value: string): boolean {
  return KEY_PATTERN.test(value);
}

export function hashStudioOrderIdempotencyKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Canonical request fingerprint for Studio v8 create.
 * Same logical payload → same hash; different email/document/assets → different hash.
 */
export function hashStudioOrderRequest(input: {
  buyerEmail: string;
  artworkJson: string;
}): string {
  return createHash("sha256")
    .update("atajo-studio-v8-request\0")
    .update(input.buyerEmail)
    .update("\0")
    .update(input.artworkJson)
    .digest("hex");
}

export function studioOrderRequestHashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && left.length === 32 && timingSafeEqual(left, right);
}

/**
 * Server secret used to derive (not store) Studio v8 delivery keys for idempotent replay.
 * Production requires ORDER_ACCESS_SECRET (≥32 chars). Dev may use a fixed fallback.
 */
export function orderAccessSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = env.ORDER_ACCESS_SECRET?.trim() ?? "";
  if (configured.length >= 32) return configured;
  if ((env.NODE_ENV ?? "").trim() === "production") return null;
  return "dev-only-order-access-secret-not-for-production!";
}

/**
 * Deterministic delivery key for Studio v8.
 * Recoverable on replay from (publicId, draftKeyHash, idempotencyKey, server secret)
 * without storing plaintext. Verification remains hash-only on Order.deliveryKeyHash.
 */
export function deriveStudioV8DeliveryKey(input: {
  publicId: string;
  draftKeyHash: string;
  idempotencyKey: string;
  secret: string;
}): string {
  return createHmac("sha256", input.secret)
    .update("atajo-studio-v8-delivery\0")
    .update(input.publicId)
    .update("\0")
    .update(input.draftKeyHash)
    .update("\0")
    .update(input.idempotencyKey)
    .digest("base64url");
}
