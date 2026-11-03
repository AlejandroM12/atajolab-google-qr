import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Opaque draft credential for temporary Studio assets (never stored in clear). */
export function createStudioDraftKey(): string {
  return randomBytes(32).toString("base64url");
}

export function hashStudioDraftKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function studioDraftKeysMatch(key: string, storedHash: string | null): boolean {
  if (!storedHash || !KEY_PATTERN.test(key)) return false;
  const received = Buffer.from(hashStudioDraftKey(key), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return stored.length === received.length && timingSafeEqual(stored, received);
}

export function isStudioDraftKey(value: string): boolean {
  return KEY_PATTERN.test(value);
}
