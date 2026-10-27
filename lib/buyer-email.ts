const CONTROL_OR_SPACE = /[\u0000-\u0020\u007F]/;
const EMAIL_PATTERN =
  /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function parseBuyerEmail(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 254) return null;
  const email = value.trim().toLowerCase();
  if (email.length < 6 || email.length > 254 || CONTROL_OR_SPACE.test(email) || email.includes("..")) return null;
  return EMAIL_PATTERN.test(email) ? email : null;
}
