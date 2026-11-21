import { mkdir, appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createResendSender, readResendConfig, type ResendFetch } from "@/lib/mail-resend";

export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

export type MailMessage = {
  to: string;
  subject: string;
  /** Plain-text alternative; always present. */
  text: string;
  html?: string;
  attachments?: MailAttachment[];
  replyTo?: string;
};

/** held = local outbox; sent = provider accepted; retryable = temporary; refused = permanent. */
export type MailResult = "held" | "sent" | "retryable" | "refused";

export type MailMode = "dev-outbox" | "resend" | "unconfigured";

export type MailSender = {
  mode: MailMode;
  canDispatch: boolean;
  send(message: MailMessage): Promise<MailResult>;
};

/**
 * Sin proveedor, el desarrollo guarda el mensaje en un archivo local.
 * Eso no es una entrega a un buzón. Producción sin adaptador rechaza el envío.
 */
export function createMailSender(
  env: NodeJS.ProcessEnv = process.env,
  directory = path.join(process.cwd(), ".data"),
  fetchImpl?: ResendFetch,
): MailSender {
  const provider = env.EMAIL_PROVIDER?.trim().toLowerCase() ?? "";
  if (provider === "resend") {
    const config = readResendConfig(env);
    return config ? createResendSender(config, fetchImpl) : refuseSender();
  }
  if (provider.length === 0 && env.NODE_ENV === "development") return createDevOutbox(directory);
  return refuseSender();
}

function refuseSender(): MailSender {
  return {
    mode: "unconfigured",
    canDispatch: false,
    async send() {
      return "refused";
    },
  };
}

export function createDevOutbox(directory: string): MailSender {
  return {
    mode: "dev-outbox",
    canDispatch: true,
    async send(message) {
      try {
        await mkdir(directory, { recursive: true });
        const { attachments, ...rest } = message;
        const stamp = Date.now();
        const saved: { filename: string; bytes: number; file: string }[] = [];
        for (const attachment of attachments ?? []) {
          const file = `mail-outbox-${stamp}-${attachment.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`;
          await writeFile(path.join(directory, file), attachment.content);
          saved.push({ filename: attachment.filename, bytes: attachment.content.length, file });
        }
        const line = `${JSON.stringify({ at: new Date().toISOString(), ...rest, attachments: saved })}\n`;
        await appendFile(path.join(directory, "mail-outbox.jsonl"), line, { encoding: "utf8", flag: "a" });
        return "held";
      } catch {
        return "refused";
      }
    },
  };
}
