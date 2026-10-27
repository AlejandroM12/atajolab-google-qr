import { accessRedirect, trustedPublicOrigin } from "@/lib/access-link";
import { redeemDownloadAccess } from "@/lib/orders";
import { orderAccessCookie } from "@/lib/payments/access";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  let received = token;
  try {
    received = decodeURIComponent(token);
  } catch {
    return redirectTo("/recuperar?estado=enlace");
  }

  try {
    const redeemed = await redeemDownloadAccess(received, new Date());
    if (!redeemed.ok) return redirectTo("/recuperar?estado=enlace");
    const headers = redirectHeaders(`/pedido/${redeemed.publicId}`);
    headers.append(
      "set-cookie",
      orderAccessCookie(
        redeemed.publicId,
        redeemed.deliveryKey,
        trustedPublicOrigin(process.env.APP_URL)?.protocol === "https:",
      ),
    );
    return new Response(null, { status: 303, headers });
  } catch (error) {
    console.error("access redeem failed", error instanceof Error ? error.name : "unknown");
    return redirectTo("/recuperar?estado=enlace");
  }
}

function redirectTo(path: string): Response {
  return new Response(null, { status: 303, headers: redirectHeaders(path) });
}

function redirectHeaders(path: string): Headers {
  return new Headers({
    location: accessRedirect(process.env.APP_URL, path),
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-robots-tag": "noindex",
  });
}
