/**
 * Security headers applied to every response from next.config.ts.
 *
 * CSP without nonces: nonce-based CSP forces dynamic rendering and is not
 * compatible with Cache Components / partial prerendering, which this app
 * uses. Inline scripts from Next.js therefore need 'unsafe-inline'. The
 * policy still blocks third-party scripts, framing, plugins, foreign form
 * targets and base-tag hijacking.
 *
 * Optional analytics (NEXT_PUBLIC_PLAUSIBLE_DOMAIN) adds its own host to
 * script-src and connect-src.
 */

export const PLAUSIBLE_HOST = "https://plausible.io";

export function contentSecurityPolicy(input: {
  production: boolean;
  /** Public origin is https (APP_URL). Defaults to `production`. */
  https?: boolean;
  analytics?: boolean;
}): string {
  const analytics = input.analytics ?? Boolean(process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim());
  const scriptSrc = ["'self'", "'unsafe-inline'"];
  if (!input.production) scriptSrc.push("'unsafe-eval'");
  const connectSrc = ["'self'"];
  if (analytics) {
    scriptSrc.push(PLAUSIBLE_HOST);
    connectSrc.push(PLAUSIBLE_HOST);
  }

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    // Previews are data: URLs; the editor uses blob: for local images.
    "img-src 'self' blob: data:",
    // Inline SVG previews embed fonts as data: URLs.
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];
  if (input.https ?? input.production) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function securityHeaders(input: { production: boolean; https?: boolean }): Array<{ key: string; value: string }> {
  const headers = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (input.https ?? input.production) {
    // Two years. Add "preload" only after submitting the domain to hstspreload.org.
    headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  }
  return headers;
}
