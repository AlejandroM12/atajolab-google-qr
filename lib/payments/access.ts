import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const ORDER_ACCESS_COOKIE = "atajo_pedido";

export function orderAccessCookieName(publicId: string): string {
  return `${ORDER_ACCESS_COOKIE}_${publicId}`;
}

const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createDeliveryKey(): string {
  return randomBytes(32).toString("base64url");
}

export function hashDeliveryKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function deliveryKeysMatch(key: string, storedHash: string | null): boolean {
  if (!storedHash || !KEY_PATTERN.test(key)) {
    return false;
  }

  const received = Buffer.from(hashDeliveryKey(key), "hex");
  const stored = Buffer.from(storedHash, "hex");

  return stored.length === received.length && timingSafeEqual(stored, received);
}

export function readOrderAccess(
  cookieHeader: string | null,
  publicId: string,
): string | null {
  if (!cookieHeader) {
    return null;
  }

  const prefix = `${orderAccessCookieName(publicId)}=`;

  for (const part of cookieHeader.split(";")) {
    const value = part.trim();

    if (!value.startsWith(prefix)) {
      continue;
    }

    const key = decodeURIComponent(value.slice(prefix.length));
    return KEY_PATTERN.test(key) ? key : null;
  }

  return null;
}

export function orderAccessCookie(
  publicId: string,
  key: string,
  secure: boolean,
): string {
  const parts = [
    `${orderAccessCookieName(publicId)}=${key}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${60 * 60 * 24 * 7}`,
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function digitalDeliveryAllowed(input: {
  downloadsEnabled: boolean;
  status: string;
  key: string | null;
  storedHash: string | null;
  extraHashes?: readonly string[];
}): boolean {
  if (!input.downloadsEnabled || input.status !== "PAID" || input.key === null) return false;
  const key = input.key;
  if (deliveryKeysMatch(key, input.storedHash)) return true;
  return (input.extraHashes ?? []).some((hash) => deliveryKeysMatch(key, hash));
}
