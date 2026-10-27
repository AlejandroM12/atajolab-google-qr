import { accessLinkUrl } from "@/lib/access-link";
import { isDatabaseUnavailable } from "@/lib/db-error";
import { DIGITAL_DOWNLOADS_ENABLED } from "@/lib/delivery";
import { createDownloadAccessLink, findDownloadOrder } from "@/lib/orders";
import { digitalDeliveryAllowed, readOrderAccess } from "@/lib/payments/access";
import { appOrigin } from "@/lib/payments/checkout-policy";
import { parseEmptyBody } from "@/lib/recovery";

export async function POST(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await context.params;
  const body = await readBody(request);
  if (body === undefined) return accessError(400, "invalid-body");
  const bodyError = parseEmptyBody(body);
  if (bodyError) return accessError(400, bodyError);

  const origin = appOrigin(process.env.APP_URL);
  if (!origin) return accessError(500, "access-unavailable");

  try {
    const order = await findDownloadOrder(publicId);
    if (!order || order.publicId !== publicId) return accessError(404, "not-found");
    const allowed = digitalDeliveryAllowed({
      downloadsEnabled: DIGITAL_DOWNLOADS_ENABLED,
      status: order.status,
      key: readOrderAccess(request.headers.get("cookie"), publicId),
      storedHash: order.deliveryKeyHash,
      extraHashes: order.accessKeyHashes,
    });
    if (!allowed) return accessError(403, "access-unavailable");

    const issued = await createDownloadAccessLink(publicId, new Date());
    if (issued === "capped") return accessError(429, "link-limit");
    if (issued === "unavailable") return accessError(403, "access-unavailable");
    const url = accessLinkUrl(origin.href, issued.token);
    if (!url) return accessError(500, "access-unavailable");

    return Response.json(
      { url, expiresAt: issued.expiresAt.toISOString() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("access link failed", error instanceof Error ? error.name : "unknown");
    if (isDatabaseUnavailable(error)) return accessError(503, "database-unavailable");
    return accessError(500, "access-unavailable");
  }
}

async function readBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) return undefined;
  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return undefined;
  }
  if (raw.length > 2000) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function accessError(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}
