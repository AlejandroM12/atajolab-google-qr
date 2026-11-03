import { parseBuyerEmail } from "@/lib/buyer-email";
import {
  issueAccessLink,
  linkCapOpen,
  recoveryMail,
  type AccessLinkRecord,
} from "@/lib/access-link";
import type { MailResult, MailSender } from "@/lib/mail";
import type { OrderStatus } from "@/lib/delivery";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_CLIENT = 5;
const MAX_PER_EMAIL = 3;
const MAX_GLOBAL = 30;
const MAX_RECOVERY_ORDERS = 5;

export const recoveryLimits = {
  perClient: MAX_PER_CLIENT,
  perEmail: MAX_PER_EMAIL,
  global: MAX_GLOBAL,
  windowMs: WINDOW_MS,
} as const;

export type RecoveryCandidate = {
  publicId: string;
  status: OrderStatus;
  buyerEmail: string | null;
  label: string;
};

export type RecoveryStore = {
  findOrders(email: string): Promise<RecoveryCandidate[]>;
  countActiveLinks(publicId: string, now: Date): Promise<number>;
  saveLink(record: AccessLinkRecord): Promise<boolean>;
  revoke(tokenHashes: string[]): Promise<void>;
};

export function recoveryAcknowledgement(): { status: "accepted" } {
  return { status: "accepted" };
}

export function recoveryTargets(email: string, orders: RecoveryCandidate[]): RecoveryCandidate[] {
  return orders
    .filter((order) => order.status === "PAID" && order.buyerEmail === email)
    .slice(0, MAX_RECOVERY_ORDERS);
}

export function parseRecoveryBody(
  body: unknown,
): { ok: true; email: string } | { ok: false; error: "invalid-body" | "unexpected-field" | "invalid-email" } {
  if (!isRecord(body)) return { ok: false, error: "invalid-body" };
  const keys = Object.keys(body);
  if (keys.some((key) => key !== "email")) return { ok: false, error: "unexpected-field" };
  if (!keys.includes("email")) return { ok: false, error: "invalid-body" };
  const email = parseBuyerEmail(body.email);
  if (!email) return { ok: false, error: "invalid-email" };
  return { ok: true, email };
}

export function parseEmptyBody(body: unknown): "invalid-body" | "unexpected-field" | null {
  if (!isRecord(body)) return "invalid-body";
  return Object.keys(body).length === 0 ? null : "unexpected-field";
}

export function recoveryClientKey(forwardedFor: string | null): string {
  const first = forwardedFor?.split(",")[0]?.trim() ?? "";
  if (/^[0-9a-fA-F:.]+$/.test(first) && first.length >= 2 && first.length <= 64) return first;
  return "direct";
}

export function createRecoveryLimiter(now: () => number = Date.now) {
  const byClient = new Map<string, number[]>();
  const byEmail = new Map<string, number[]>();
  const globalHits: number[] = [];

  return {
    allow(clientKey: string, email?: string): boolean {
      const moment = now();
      const clients = fresh(byClient.get(clientKey) ?? [], moment);
      const emails = email ? fresh(byEmail.get(email) ?? [], moment) : [];
      const globals = fresh(globalHits, moment);
      const blocked =
        clients.length >= MAX_PER_CLIENT ||
        globals.length >= MAX_GLOBAL ||
        (email !== undefined && emails.length >= MAX_PER_EMAIL);
      if (blocked) {
        byClient.set(clientKey, clients);
        if (email !== undefined) byEmail.set(email, emails);
        replace(globalHits, globals);
        return false;
      }
      clients.push(moment);
      globals.push(moment);
      byClient.set(clientKey, clients);
      replace(globalHits, globals);
      if (email !== undefined) {
        emails.push(moment);
        byEmail.set(email, emails);
      }
      return true;
    },
  };

  function fresh(hits: number[], moment: number): number[] {
    return hits.filter((hit) => moment - hit < WINDOW_MS);
  }
}

export async function requestRecovery(input: {
  email: string;
  now: Date;
  origin: string;
  limited: boolean;
  store: RecoveryStore;
  sender: MailSender;
}): Promise<{ status: "accepted" }> {
  const email = parseBuyerEmail(input.email);
  if (!email) return recoveryAcknowledgement();

  const orders = await input.store.findOrders(email);
  if (input.limited || !input.sender.canDispatch) return recoveryAcknowledgement();

  const targets = recoveryTargets(email, orders);
  const issued: { label: string; token: string; tokenHash: string }[] = [];
  for (const target of targets) {
    const active = await input.store.countActiveLinks(target.publicId, input.now);
    if (!linkCapOpen(active)) continue;
    const link = issueAccessLink(target.publicId, input.now);
    const saved = await input.store.saveLink(link.record);
    if (!saved) continue;
    issued.push({ label: target.label, token: link.token, tokenHash: link.record.tokenHash });
  }
  if (issued.length === 0) return recoveryAcknowledgement();

  const mail = recoveryMail(input.origin, issued);
  let dispatch: MailResult = "refused";
  if (mail) {
    try {
      dispatch = await input.sender.send({ to: email, subject: mail.subject, text: mail.text });
    } catch {
      dispatch = "refused";
    }
  }
  if (dispatch === "refused" || dispatch === "retryable") {
    await input.store.revoke(issued.map((item) => item.tokenHash));
  }
  return recoveryAcknowledgement();
}

function replace(target: number[], next: number[]): void {
  target.splice(0, target.length, ...next);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
