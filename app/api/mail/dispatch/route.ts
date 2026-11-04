import { isDatabaseUnavailable } from "@/lib/db-error";
import {
  describeMailDispatchError,
  mailDispatchAuthorized,
  mailDispatchFailureReason,
  runMailDispatchJob,
} from "@/lib/purchase-notify";

/**
 * Processes durable purchase-access mail notifications (Resend / local outbox).
 *
 * Production scheduling (Render Cron example):
 *   Every 1–5 minutes POST https://…/api/mail/dispatch
 *   Header: Authorization: Bearer $MAIL_DISPATCH_SECRET
 *
 * Concurrent ticks are safe: claim() is atomic (status PENDING → PROCESSING).
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
        {
          ok: false,
          error: result.error,
          ...(result.reason ? { reason: result.reason } : {}),
        },
        { status, headers: noStore() },
      );
    }
    return Response.json({ ok: true, ...result }, { status: 200, headers: noStore() });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      console.error(
        "mail dispatch failed",
        JSON.stringify({ kind: "database-unavailable", name: "DatabaseUnavailable" }),
      );
      return Response.json({ error: "database-unavailable" }, { status: 503, headers: noStore() });
    }
    const described = describeMailDispatchError(error);
    console.error(
      "mail dispatch failed",
      JSON.stringify({
        name: described.name,
        kind: described.kind,
        prismaCode: described.prismaCode ?? null,
        table: described.table ?? null,
        detail: described.detail ?? null,
      }),
    );
    return Response.json(
      {
        error: "dispatch-failed",
        reason: mailDispatchFailureReason(error),
      },
      { status: 500, headers: noStore() },
    );
  }
}

function noStore(): Record<string, string> {
  return { "cache-control": "no-store" };
}
