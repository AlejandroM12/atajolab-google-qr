import { isDatabaseUnavailable } from "@/lib/db-error";
import { logError } from "@/lib/log";
import {
  dispatchPurchaseAccessMail,
  mailDispatchAuthorized,
  resendPurchaseMail,
} from "@/lib/purchase-notify";
import { isPublicId } from "@/lib/public-id";

/**
 * Controlled resend of a purchase mail (operator only, same bearer as /api/mail/dispatch).
 *
 *   POST /api/mail/resend   Authorization: Bearer $MAIL_DISPATCH_SECRET   {"publicId":"…"}
 *
 * Only a PAID order qualifies. Nothing is charged; the mail carries a fresh access link and the files.
 */
export async function POST(request: Request) {
  if (!mailDispatchAuthorized(request.headers.get("authorization"))) {
    return reply(401, { error: "unauthorized" });
  }

  let publicId: unknown;
  try {
    publicId = ((await request.json()) as { publicId?: unknown }).publicId;
  } catch {
    return reply(400, { error: "invalid-body" });
  }
  if (typeof publicId !== "string" || !isPublicId(publicId)) return reply(400, { error: "invalid-order" });

  try {
    const queued = await resendPurchaseMail(publicId);
    if (queued === "not-payable") return reply(409, { error: "order-not-paid" });
    if (queued === "busy") return reply(409, { error: "mail-in-progress" });
    const result = await dispatchPurchaseAccessMail({ orderId: publicId, limit: 1 });
    return reply(200, { ok: true, ...result });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return reply(503, { error: "database-unavailable" });
    logError("mail.resend-failed", error, { publicId });
    return reply(500, { error: "resend-failed" });
  }
}

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
