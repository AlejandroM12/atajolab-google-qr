import { createHash } from "node:crypto";
import { readJsonBody } from "@/lib/http/body";
import { legal, supportMailbox } from "@/lib/legal";
import { logError, logInfo } from "@/lib/log";
import { createMailSender } from "@/lib/mail";
import { consumeBuckets, ipBucket } from "@/lib/rate-limit/policies";
import { studioClientKeyFromRequest, studioRequestTrusted } from "@/lib/studio/draft-session";
import { sharedRateLimiter } from "@/lib/studio/rate-limits";
import { parseWithdrawalBody, withdrawalCode, withdrawalMails } from "@/lib/withdrawal";

const WINDOW_MS = 60 * 60_000;

export async function POST(request: Request) {
  if (!studioRequestTrusted(request)) return failure(403, "origin-rejected");
  const body = await readJsonBody(request, 4000);
  if (body === undefined) return failure(400, "invalid-body");
  const parsed = parseWithdrawalBody(body);
  if (!parsed.ok) return failure(400, parsed.error);

  const mailbox = supportMailbox();
  if (!mailbox) return failure(503, "withdrawal-unavailable");

  try {
    const emailKey = createHash("sha256").update(parsed.request.email).digest("hex").slice(0, 32);
    const limited = await consumeBuckets(sharedRateLimiter(), [
      ipBucket("withdrawal", studioClientKeyFromRequest(request), { limit: 10, windowMs: WINDOW_MS }),
      { key: `withdrawal:email:${emailKey}`, limit: 3, windowMs: WINDOW_MS },
    ]);
    if (!limited.ok) return failure(429, "rate-limited");

    const code = withdrawalCode();
    const mails = withdrawalMails({
      request: parsed.request,
      code,
      receivedAt: new Date(),
      supportMailbox: mailbox,
      tradeName: legal.tradeName,
    });
    const sender = createMailSender();
    const toSupport = await sender.send(mails.toSupport);
    if (toSupport !== "sent" && toSupport !== "held") {
      logError("withdrawal.support-mail-failed", undefined, { code, result: toSupport });
      return failure(503, "withdrawal-unavailable");
    }
    // The buyer copy is best effort; the on-screen code is the receipt.
    const toBuyer = await sender.send(mails.toBuyer);
    logInfo("withdrawal.requested", { code, publicId: parsed.request.publicId, buyerMail: toBuyer });

    return Response.json({ code }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    logError("withdrawal.failed", error);
    return failure(500, "withdrawal-failed");
  }
}

function failure(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}
