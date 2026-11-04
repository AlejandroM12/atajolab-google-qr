import { connection } from "next/server";
import { operatorHealth, publicHealth } from "@/lib/health";
import { mailDispatchAuthorized } from "@/lib/purchase-notify";

/**
 * GET /api/health — uptime checks (200 ok / 503 degraded). Public body has no config.
 * With `Authorization: Bearer $MAIL_DISPATCH_SECRET` it adds the operator view
 * (config presence and stuck-payment / failed-mail counters).
 */
export async function GET(request: Request) {
  await connection();
  const operator = mailDispatchAuthorized(request.headers.get("authorization"));
  const body = operator ? await operatorHealth(request) : await publicHealth();
  return Response.json(body, {
    status: body.status === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
