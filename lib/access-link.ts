import { createHash, randomBytes } from "node:crypto";

export const ACCESS_LINK_TTL_MS = 30 * 60 * 1000;
export const MAX_ACTIVE_ACCESS_LINKS = 3;
export const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type AccessLinkRecord = {
  tokenHash: string;
  orderId: string;
  expiresAt: Date;
  usedAt: Date | null;
};

export function createAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function issueAccessLink(orderId: string, now: Date): { token: string; record: AccessLinkRecord } {
  const token = createAccessToken();
  return {
    token,
    record: {
      tokenHash: hashAccessToken(token),
      orderId,
      expiresAt: new Date(now.getTime() + ACCESS_LINK_TTL_MS),
      usedAt: null,
    },
  };
}

export function linkCapOpen(activeUnused: number): boolean {
  return activeUnused < MAX_ACTIVE_ACCESS_LINKS;
}

export function consumeAccessLink(
  record: AccessLinkRecord | null,
  now: Date,
): { ok: false; reason: "invalid" | "expired" | "used" } | { ok: true; record: AccessLinkRecord } {
  if (!record) return { ok: false, reason: "invalid" };
  if (record.usedAt) return { ok: false, reason: "used" };
  if (record.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, record: { ...record, usedAt: now } };
}

const UNSAFE_PATH = /[\u0000-\u001F\u007F\\]/;

export function trustedPublicOrigin(value: string | undefined): URL | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  return url;
}

export function accessRedirect(originValue: string | undefined, path: string): string {
  const safe = safeAccessPath(path);
  const origin = trustedPublicOrigin(originValue);
  if (!origin) return safe;
  const location = new URL(safe, origin);
  if (location.origin !== origin.origin) return new URL("/recuperar?estado=enlace", origin).href;
  return location.href;
}

export function accessLinkUrl(origin: string, token: string): string | null {
  if (!ACCESS_TOKEN_PATTERN.test(token)) return null;
  const base = trustedPublicOrigin(origin);
  if (!base) return null;
  return new URL(`/acceso/${token}`, base).href;
}

function safeAccessPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || UNSAFE_PATH.test(path)) return "/recuperar?estado=enlace";
  return path;
}

function safeMailLabel(value: string): string {
  return value.replace(/[\r\n]/g, " ").trim().slice(0, 80) || "Tu diseño";
}

export function recoveryMail(
  origin: string,
  entries: { label: string; token: string }[],
): { subject: string; text: string } | null {
  const lines: string[] = [];
  for (const entry of entries) {
    const url = accessLinkUrl(origin, entry.token);
    if (!url) return null;
    lines.push(`${safeMailLabel(entry.label)}\n${url}`);
  }
  if (lines.length === 0) return null;
  return {
    subject: "Acceso a tus descargas de AtajoLab",
    text: [
      "Pediste entrar a tus descargas de AtajoLab QR.",
      "Cada enlace vence en 30 minutos y funciona una sola vez.",
      "Desde la página del pedido podés bajar PNG, SVG y PDF.",
      "",
      lines.join("\n\n"),
      "",
      "Si no pediste este acceso, podés ignorar el mensaje.",
    ].join("\n"),
  };
}

/**
 * Proactive access mail after a purchase becomes PAID (v7 and Studio v8).
 * Includes a one-time access link — never draftKey, idempotencyKey, or asset ids.
 */
export function purchaseMail(input: {
  origin: string;
  label: string;
  publicId: string;
  token: string;
}): { subject: string; text: string } | null {
  const url = accessLinkUrl(input.origin, input.token);
  if (!url) return null;
  const label = safeMailLabel(input.label);
  const publicId = input.publicId.replace(/[\r\n]/g, "").trim();
  if (!publicId) return null;
  return {
    subject: "Tu compra de AtajoLab está lista",
    text: [
      "Confirmamos tu compra en AtajoLab QR.",
      "",
      `Diseño: ${label}`,
      `Pedido: ${publicId}`,
      "",
      "Usá este enlace para abrir tus descargas. Vence en 30 minutos y funciona una sola vez:",
      url,
      "",
      "En la página del pedido vas a poder descargar PNG, SVG y PDF listos para imprimir.",
      "Si cerrás el navegador, recuperá el acceso en /recuperar con el mismo correo de la compra.",
      "",
      "Si no reconocés esta compra, ignorá el mensaje.",
    ].join("\n"),
  };
}
