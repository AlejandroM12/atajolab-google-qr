import {
  createStudioDraftKey,
  hashStudioDraftKey,
  isStudioDraftKey,
} from "@/lib/studio/assets/draft-key";
import { STUDIO_ASSET_TEMP_TTL_MS } from "@/lib/studio/assets/limits";
import { appOrigin } from "@/lib/payments/checkout-policy";
import {
  rateLimitClientKeyFromRequest,
  RATE_LIMIT_UNTRUSTED_KEY,
} from "@/lib/client-ip";

export const STUDIO_DRAFT_COOKIE = "atajo_studio_draft";

const MAX_AGE_SEC = Math.floor(STUDIO_ASSET_TEMP_TTL_MS / 1000);

export function studioDraftCookie(
  draftKey: string,
  secure: boolean,
): string {
  const parts = [
    `${STUDIO_DRAFT_COOKIE}=${draftKey}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SEC}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearStudioDraftCookie(secure: boolean): string {
  const parts = [
    `${STUDIO_DRAFT_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readStudioDraftKey(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const prefix = `${STUDIO_DRAFT_COOKIE}=`;
  for (const part of cookieHeader.split(";")) {
    const value = part.trim();
    if (!value.startsWith(prefix)) continue;
    const key = decodeURIComponent(value.slice(prefix.length));
    return isStudioDraftKey(key) ? key : null;
  }
  return null;
}

export function issueStudioDraftSession(existingKey: string | null): {
  draftKey: string;
  draftKeyHash: string;
  created: boolean;
  setCookie: boolean;
} {
  if (existingKey && isStudioDraftKey(existingKey)) {
    return {
      draftKey: existingKey,
      draftKeyHash: hashStudioDraftKey(existingKey),
      created: false,
      setCookie: false,
    };
  }
  const draftKey = createStudioDraftKey();
  return {
    draftKey,
    draftKeyHash: hashStudioDraftKey(draftKey),
    created: true,
    setCookie: true,
  };
}

export function studioSecureCookies(env: NodeJS.ProcessEnv = process.env): boolean {
  return appOrigin(env.APP_URL)?.protocol === "https:";
}

/** Prefer Origin; fall back to Referer host. Reject cross-site cookie mutations. */
export function studioRequestTrusted(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expected = appOrigin(env.APP_URL);
  if (!expected) {
    // Local misconfig: only allow when Host matches a loopback request.
    const host = request.headers.get("host") ?? "";
    return /^localhost(:\d+)?$/i.test(host) || /^127\.0\.0\.1(:\d+)?$/.test(host);
  }

  const originHeader = request.headers.get("origin");
  if (originHeader) {
    try {
      const origin = new URL(originHeader);
      return origin.protocol === expected.protocol && origin.host === expected.host;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      return url.protocol === expected.protocol && url.host === expected.host;
    } catch {
      return false;
    }
  }

  // Cookie-authenticated browser posts should send Origin or Referer.
  return false;
}

/**
 * Studio rate-limit identity. Delegates to the shared client-IP policy
 * (`lib/client-ip.ts`). Default ignores forgeable headers.
 */
export function studioClientKeyFromRequest(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return rateLimitClientKeyFromRequest(request, env);
}

/** @deprecated Prefer studioClientKeyFromRequest — XFF leftmost is spoofable. */
export function studioClientKey(forwardedFor: string | null): string {
  void forwardedFor;
  return RATE_LIMIT_UNTRUSTED_KEY;
}

export {
  createStudioDraftKey,
  hashStudioDraftKey,
  isStudioDraftKey,
};
