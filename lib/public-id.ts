import { randomBytes } from "node:crypto";

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{24}$/;

export function createPublicId(): string {
  return randomBytes(18).toString("base64url");
}

export function isPublicId(value: string): boolean {
  return PUBLIC_ID_PATTERN.test(value);
}
