import { isDatabaseUnavailable } from "@/lib/db-error";
import {
  mailDispatchAuthorized,
  runMailDispatchJob,
} from "@/lib/purchase-notify";

/**
 * Processes durable purchase-access mail notifications (Resend / local outbox).
 *
 * Production scheduling (Render Cron example):
 *   Every 1–5 minutes POST https://…/api/mail/dispatch
 *   Header: Authorization: Bearer $MAIL_DISPATCH_SECRET
 *
 * Uses a Postgres advisory lock so overlapping ticks do not double-send.
 */
export async function POST(request: Request) {
  if (!mailDispatchAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: noStore() });
  }

  try {
    const result = await runMailDispatchJob();
    if ("ok" in result && result.ok === false) {
      const status = result.error === "lock-failed" ? 200 : 500;
      return Response.json(
        { ok: false, error: result.error },
        { status, headers: noStore() },
      );
    }
    return Response.json({ ok: true, ...result }, { status: 200, headers: noStore() });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "database-unavailable" }, { status: 503, headers: noStore() });
    }
    console.error("mail dispatch failed", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "dispatch-failed" }, { status: 500, headers: noStore() });
  }
}

function noStore(): Record<string, string> {
  return { "cache-control": "no-store" };
}
