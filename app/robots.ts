import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * Private pages (/pedido, /recuperar) are not disallowed here on purpose:
 * crawlers must be able to read their noindex. API routes and one-time access
 * links are blocked outright.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = siteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/acceso/"],
    },
    sitemap: new URL("/sitemap.xml", origin).href,
    host: origin.origin,
  };
}
