import Script from "next/script";
import { PLAUSIBLE_HOST } from "@/lib/security-headers";

/**
 * Cookieless page and funnel analytics (Plausible). Off unless
 * NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set at build time. Events never carry
 * personal data (see lib/analytics.ts).
 */
export function AnalyticsScript() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim();
  if (!domain) return null;
  return (
    <>
      <Script id="plausible-queue" strategy="afterInteractive">
        {"window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)}"}
      </Script>
      <Script
        defer
        data-domain={domain}
        src={`${PLAUSIBLE_HOST}/js/script.js`}
        strategy="afterInteractive"
      />
    </>
  );
}
