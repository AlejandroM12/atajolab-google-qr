import { PIECE_CURRENCY, PIECE_PRICE_ARS } from "@/lib/pricing";

/** Production domain (README). APP_URL overrides it in every environment. */
const DEFAULT_SITE_URL = "https://qr.atajolab.dev";

export const SITE_NAME = "AtajoLab QR";
export const BRAND_NAME = "AtajoLab";

export const SITE_DESCRIPTION =
  "Creá un cartel QR para que tus clientes dejen una reseña en Google o encuentren tu negocio en Google Maps. Personalizalo y descargalo listo para imprimir.";

/** Public origin without trailing slash. Safe to call at build time. */
export function siteUrl(env: NodeJS.ProcessEnv = process.env): URL {
  const raw = env.APP_URL?.trim();
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" || url.protocol === "http:") return new URL(url.origin);
    } catch {
      // fall through to the default
    }
  }
  return new URL(DEFAULT_SITE_URL);
}

/** Pages that search engines may list. Everything else is private or utility. */
export const PUBLIC_PATHS = [
  "/",
  "/crear",
  "/preguntas-frecuentes",
  "/terminos",
  "/privacidad",
  "/reembolsos",
  "/arrepentimiento",
  "/contacto",
] as const;

/** schema.org JSON-LD for the home page. Only facts the code guarantees. */
export function homeStructuredData(origin: URL): Record<string, unknown> {
  const url = origin.href.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${url}/#organization`,
        name: BRAND_NAME,
        url,
      },
      {
        "@type": "WebSite",
        "@id": `${url}/#website`,
        name: SITE_NAME,
        url,
        inLanguage: "es-AR",
        publisher: { "@id": `${url}/#organization` },
      },
      {
        "@type": "Product",
        name: "Cartel QR A6 para reseñas de Google",
        description:
          "Pieza digital A6 (105 × 148 mm) con código QR a tu ficha o a tus reseñas de Google. Archivos PNG, SVG y PDF listos para imprimir.",
        brand: { "@id": `${url}/#organization` },
        offers: {
          "@type": "Offer",
          price: String(PIECE_PRICE_ARS),
          priceCurrency: PIECE_CURRENCY,
          availability: "https://schema.org/OnlineOnly",
          url: `${url}/crear`,
        },
      },
    ],
  };
}

/** Serializes JSON-LD for a <script> tag without allowing `</script>` breakouts. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
