import { isDatabaseUnavailable } from "@/lib/db-error";
import {
  describeMailDispatchError,
  mailDispatchAuthorized,
  runMailDispatchJob,
} from "@/lib/purchase-notify";
import { logError } from "@/lib/log";

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
      logError("mail.dispatch-failed", undefined, { kind: "database-unavailable" });
      return Response.json({ error: "database-unavailable" }, { status: 503, headers: noStore() });
    }
    const described = describeMailDispatchError(error);
    logError("mail.dispatch-failed", undefined, {
      errorName: described.name,
      kind: described.kind,
      prismaCode: described.prismaCode ?? null,
      detail: described.detail ?? null,
    });
    return Response.json(
      {
        error: "dispatch-failed",
        reason: described.prismaCode ?? described.kind,
      },
      { status: 500, headers: noStore() },
    );
  }
}

function noStore(): Record<string, string> {
  return { "cache-control": "no-store" };
}
