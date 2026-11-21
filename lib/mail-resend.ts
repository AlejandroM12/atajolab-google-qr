import { parseBuyerEmail } from "@/lib/buyer-email";
import type { MailSender } from "@/lib/mail";

const RESEND_API = "https://api.resend.com";
const SEND_TIMEOUT_MS = 8000;
/** Attachments are base64-encoded in the request: give the upload more time. */
const SEND_WITH_ATTACHMENTS_TIMEOUT_MS = 40_000;
/**
 * Resend accepts up to 40 MB per message after base64 encoding, and Gmail refuses to receive more than
 * 25 MB. Base64 adds a third, so 15 MB of raw files stays below both with room for the HTML.
 */
export const MAIL_ATTACHMENT_BUDGET_BYTES = 15 * 1024 * 1024;
const HEADER_BREAK = /[\u0000-\u001F\u007F]/;
const DISPLAY_FROM = /^([^<>]+)<([^<>]+)>$/;

export type ResendConfig = {
  apiKey: string;
  from: string;
};

export type ResendFetch = (input: string, init: RequestInit) => Promise<Response>;

export function readResendConfig(env: NodeJS.ProcessEnv): ResendConfig | null {
  const apiKey = readApiKey(env.RESEND_API_KEY);
  const from = parseResendFrom(env.EMAIL_FROM);
  if (!apiKey || !from) return null;
  if (env.NODE_ENV === "production" && from.address.endsWith("@resend.dev")) return null;
  return { apiKey, from: from.header };
}

export function createResendSender(config: ResendConfig, fetchImpl: ResendFetch = fetch): MailSender {
  return {
    mode: "resend",
    canDispatch: true,
    async send(message) {
      const to = parseBuyerEmail(message.to);
      if (!to || message.subject.includes("\n") || message.subject.includes("\r")) return "refused";
      const replyTo = message.replyTo ? parseBuyerEmail(message.replyTo) : null;
      const attached = (message.attachments ?? []).reduce((sum, attachment) => sum + attachment.content.length, 0);
      if (attached > MAIL_ATTACHMENT_BUDGET_BYTES) return "refused";
      try {
        const response = await fetchImpl(`${RESEND_API}/emails`, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(message.attachments?.length ? SEND_WITH_ATTACHMENTS_TIMEOUT_MS : SEND_TIMEOUT_MS),
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: config.from,
            to: [to],
            subject: message.subject,
            text: message.text,
            ...(message.html ? { html: message.html } : {}),
            ...(replyTo ? { reply_to: replyTo } : {}),
            ...(message.attachments?.length
              ? {
                  attachments: message.attachments.map((attachment) => ({
                    filename: attachment.filename,
                    content: attachment.content.toString("base64"),
                    content_type: attachment.contentType,
                  })),
                }
              : {}),
          }),
        });
        await discard(response);
        if (response.ok) return "sent";
        // 429 / 5xx: retry later. Other 4xx: permanent (bad from, invalid key shape already filtered).
        if (response.status === 429 || response.status >= 500) return "retryable";
        return "refused";
      } catch {
        return "retryable";
      }
    },
  };
}

function readApiKey(value: string | undefined): string | null {
  const apiKey = value?.trim() ?? "";
  if (!apiKey.startsWith("re_") || apiKey.length < 4 || HEADER_BREAK.test(apiKey) || /\s/.test(apiKey)) return null;
  return apiKey;
}

function parseResendFrom(value: unknown): { header: string; address: string } | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (raw.length === 0 || HEADER_BREAK.test(raw)) return null;
  const display = DISPLAY_FROM.exec(raw);
  if (display) {
    const name = display[1].trim();
    const address = parseBuyerEmail(display[2]);
    if (name.length === 0 || name.length > 80 || !address) return null;
    return { header: `${name} <${address}>`, address };
  }
  const address = parseBuyerEmail(raw);
  return address ? { header: address, address } : null;
}

async function discard(response: Response): Promise<void> {
  await response.arrayBuffer().catch(() => undefined);
}
