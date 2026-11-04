import { randomBytes } from "node:crypto";
import { parseBuyerEmail } from "@/lib/buyer-email";
import type { MailMessage } from "@/lib/mail";
import { isPublicId } from "@/lib/public-id";

/**
 * "Botón de arrepentimiento" (Disposición 954/2025 SSDCyLC, which repealed
 * Res. 424/2020): a revocation request without registration. The buyer gets
 * the request code at once (art. 5 requires it within 24 hours); the request
 * goes to the support mailbox, where the owner processes it.
 */

export type WithdrawalRequest = {
  email: string;
  publicId: string | null;
  reason: string;
};

export type WithdrawalParse =
  | { ok: true; request: WithdrawalRequest }
  | { ok: false; error: "invalid-body" | "invalid-email" | "invalid-order" | "reason-too-long" };

const MAX_REASON = 1000;

export function parseWithdrawalBody(body: unknown): WithdrawalParse {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "invalid-body" };
  const record = body as Record<string, unknown>;
  const allowed = new Set(["email", "publicId", "reason"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) return { ok: false, error: "invalid-body" };

  const email = parseBuyerEmail(record.email);
  if (!email) return { ok: false, error: "invalid-email" };

  const rawId = typeof record.publicId === "string" ? record.publicId.trim() : "";
  if (rawId && !isPublicId(rawId)) return { ok: false, error: "invalid-order" };

  const reason = typeof record.reason === "string" ? record.reason.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim() : "";
  if (reason.length > MAX_REASON) return { ok: false, error: "reason-too-long" };

  return { ok: true, request: { email, publicId: rawId || null, reason } };
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Human-friendly request code, e.g. ARR-7K2Q-9MXD. */
export function withdrawalCode(): string {
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
  return `ARR-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}

export function withdrawalMails(input: {
  request: WithdrawalRequest;
  code: string;
  receivedAt: Date;
  supportMailbox: string;
  tradeName: string;
}): { toSupport: MailMessage; toBuyer: MailMessage } {
  const when = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(input.receivedAt);
  const order = input.request.publicId ?? "(no indicado)";
  return {
    toSupport: {
      to: input.supportMailbox,
      subject: `Solicitud de arrepentimiento ${input.code}`,
      text: [
        `Código de solicitud: ${input.code}`,
        `Recibida: ${when}`,
        `Correo del comprador: ${input.request.email}`,
        `Pedido: ${order}`,
        "",
        "Motivo (opcional):",
        input.request.reason || "(sin motivo)",
        "",
        "Respondé al comprador y procesá la revocación según la política de reembolsos.",
      ].join("\n"),
    },
    toBuyer: {
      to: input.request.email,
      subject: `Recibimos tu solicitud de arrepentimiento (${input.code})`,
      text: [
        `Recibimos tu solicitud de revocación de compra en ${input.tradeName}.`,
        "",
        `Código de solicitud: ${input.code}`,
        `Pedido: ${order}`,
        `Fecha: ${when}`,
        "",
        "Te vamos a escribir a este correo para continuar el trámite. Guardá el código para cualquier consulta.",
      ].join("\n"),
    },
  };
}
