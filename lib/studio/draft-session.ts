import { createHash } from "node:crypto";
import {
  createStudioDraftKey,
  hashStudioDraftKey,
  isStudioDraftKey,
} from "@/lib/studio/assets/draft-key";
import { STUDIO_ASSET_TEMP_TTL_MS } from "@/lib/studio/assets/limits";
import { appOrigin } from "@/lib/payments/checkout-policy";

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
 * Rate-limit identity derived from proxy-guaranteed headers only.
 *
 * Prefer CF-Connecting-IP (Cloudflare overwrites this; clients cannot spoof it
 * when traffic reaches the app through Cloudflare). Fall back to a single-value
 * X-Real-IP when present.
 *
 * Never trust the leftmost X-Forwarded-For entry: clients can prepend spoofed
 * IPs before a proxy appends the real hop. Without a configured trusted-hop
 * count, collapse to the shared "untrusted" bucket. Draft-scoped limits still
 * apply independently. Raw IPs are hashed — never stored.
 */
export function studioClientKeyFromRequest(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip")?.trim() ?? "";
  if (isClientIpLiteral(cf)) return hashClientIp(cf);

  const realIp = request.headers.get("x-real-ip")?.trim() ?? "";
  if (isClientIpLiteral(realIp)) return hashClientIp(realIp);

  return "untrusted";
}

/** @deprecated Prefer studioClientKeyFromRequest — XFF leftmost is spoofable. */
export function studioClientKey(forwardedFor: string | null): string {
  void forwardedFor;
  return "untrusted";
}

function isClientIpLiteral(value: string): boolean {
  if (value.length < 2 || value.length > 64) return false;
  if (value.includes(",")) return false;
  return /^[0-9a-fA-F:.]+$/.test(value);
}

function hashClientIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export {
  createStudioDraftKey,
  hashStudioDraftKey,
  isStudioDraftKey,
};
