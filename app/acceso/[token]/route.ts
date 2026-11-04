import { accessRedirect, trustedPublicOrigin } from "@/lib/access-link";
import { accessConfirmationPage, isAccessTokenShape } from "@/lib/access-page";
import { logError } from "@/lib/log";
import { redeemDownloadAccess } from "@/lib/orders";
import { orderAccessCookie } from "@/lib/payments/access";
import { studioRequestTrusted } from "@/lib/studio/draft-session";

/**
 * GET never redeems: mail scanners prefetch links. It shows a confirmation
 * page whose form POSTs back here. See lib/access-page.ts.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const token = await readToken(context);
  if (!token) return redirectTo("/recuperar?estado=enlace");

  return new Response(accessConfirmationPage(token), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...privateHeaders(),
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const token = await readToken(context);
  if (!token) return redirectTo("/recuperar?estado=enlace");
  if (!studioRequestTrusted(request)) return redirectTo("/recuperar?estado=enlace");

  try {
    const redeemed = await redeemDownloadAccess(token, new Date());
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
    logError("access.redeem-failed", error);
    return redirectTo("/recuperar?estado=enlace");
  }
}

async function readToken(context: { params: Promise<{ token: string }> }): Promise<string | null> {
  const { token } = await context.params;
  let received: string;
  try {
    received = decodeURIComponent(token);
  } catch {
    return null;
  }
  return isAccessTokenShape(received) ? received : null;
}

function privateHeaders(): Record<string, string> {
  return {
    "cache-control": "no-store",
    // same-origin keeps the token out of third-party Referer headers while the
    // confirmation POST still carries a real Origin for the CSRF check.
    "referrer-policy": "same-origin",
    "x-robots-tag": "noindex, nofollow",
  };
}

function redirectTo(path: string): Response {
  return new Response(null, { status: 303, headers: redirectHeaders(path) });
}

function redirectHeaders(path: string): Headers {
  return new Headers({ location: accessRedirect(process.env.APP_URL, path), ...privateHeaders() });
}
