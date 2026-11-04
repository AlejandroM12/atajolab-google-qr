import type { NextConfig } from "next";
import { contentSecurityPolicy, securityHeaders } from "./lib/security-headers";

const production = process.env.NODE_ENV === "production";
// HSTS and upgrade-insecure-requests only make sense on an https origin.
const https = production && (process.env.APP_URL ?? "").trim().startsWith("https://");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.trycloudflare.com"],
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "prisma", "mercadopago", "pdfkit", "@resvg/resvg-js", "fontkit"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy({ production, https }) },
          ...securityHeaders({ production, https }),
        ],
      },
      {
        // One-time access links: keep the token out of every Referer, and out of indexes.
        source: "/acceso/:path*",
        headers: [
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        // Private order pages and API responses are never indexed.
        source: "/(pedido|api)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
