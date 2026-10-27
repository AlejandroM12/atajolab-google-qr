import { parseOrderDraft } from "@/lib/order-draft";
import { isDatabaseUnavailable } from "@/lib/db-error";
import { savePendingOrder } from "@/lib/orders";
import { orderAccessCookie } from "@/lib/payments/access";
import { appOrigin } from "@/lib/payments/checkout-policy";
import { PIECE_CURRENCY, PIECE_PRICE_ARS } from "@/lib/pricing";

const MAX_BODY_CHARS = 320_000;

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return orderError(400, "invalid-body");
  }

  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return orderError(400, "invalid-body");
  }
  if (raw.length > MAX_BODY_CHARS) return orderError(400, "invalid-body");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return orderError(400, "invalid-body");
  }

  const parsed = parseOrderDraft(body);
  if (!parsed.ok) return orderError(400, parsed.error);

  try {
    const created = await savePendingOrder(parsed.draft);
    const headers = new Headers({ "cache-control": "no-store" });
    headers.set(
      "set-cookie",
      orderAccessCookie(
        created.publicId,
        created.deliveryKey,
        appOrigin(process.env.APP_URL)?.protocol === "https:",
      ),
    );
    return Response.json(
      {
        publicId: created.publicId,
        status: "PENDING",
        amountArs: PIECE_PRICE_ARS,
        currency: PIECE_CURRENCY,
      },
      { status: 201, headers },
    );
  } catch (error) {
    console.error("order create failed", error instanceof Error ? error.name : "unknown");
    if (isDatabaseUnavailable(error)) return orderError(503, "database-unavailable");
    return orderError(500, "order-failed");
  }
}

function orderError(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}
