import { parseBuyerEmail } from "@/lib/buyer-email";
import type { MailSender } from "@/lib/mail";

const RESEND_API = "https://api.resend.com";
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
      try {
        const response = await fetchImpl(`${RESEND_API}/emails`, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(8000),
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: config.from,
            to: [to],
            subject: message.subject,
            text: message.text,
          }),
        });
        await discard(response);
        return response.ok ? "sent" : "refused";
      } catch {
        return "refused";
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
