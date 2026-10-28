/**
 * Validates a Google Maps location link or a Google review-form link
 * before it can be encoded in a QR code.
 */

export type GoogleLinkGoal = "ubicacion" | "resena";

export type LinkIssue =
  | "empty"
  | "too-long"
  | "unsafe-characters"
  | "invalid-url"
  | "insecure-protocol"
  | "credentials"
  | "port"
  | "punycode"
  | "not-google"
  | "unsupported-google-domain"
  | "unsupported-short-link"
  | "incomplete-short-link"
  | "generic-maps"
  | "not-location"
  | "review-instead-of-location"
  | "location-instead-of-review"
  | "not-review"
  | "gpage-not-review"
  | "business-profile"
  | "missing-place-id"
  | "invalid-place-id";

export type LinkResult =
  | { ok: true; href: string; goal: GoogleLinkGoal; unverified?: boolean }
  | { ok: false; issue: LinkIssue };

const MAX_URL_LENGTH = 1500;

/**
 * Public suffixes where Google operates google.<suffix>.
 * Matched only as the exact remainder after the label "google".
 */
const GOOGLE_PUBLIC_SUFFIXES = new Set<string>([
  "com",
  "com.ar",
  "com.bo",
  "com.br",
  "cl",
  "com.co",
  "co.cr",
  "com.cu",
  "com.do",
  "com.ec",
  "com.gt",
  "com.hn",
  "com.mx",
  "com.ni",
  "com.pa",
  "com.pe",
  "com.pr",
  "com.py",
  "com.sv",
  "com.uy",
  "com.ve",
  "es",
  "pt",
  "fr",
  "de",
  "it",
  "co.uk",
  "ca",
  "com.au",
  "co.nz",
  "co.jp",
  "co.in",
  "com.sg",
  "com.hk",
  "co.za",
  "com.tr",
  "com.tw",
  "co.kr",
  "com.vn",
  "co.id",
  "com.ph",
  "com.my",
  "com.pk",
  "com.eg",
  "co.il",
  "ae",
  "com.sa",
  "nl",
  "be",
  "ch",
  "at",
  "pl",
  "se",
  "no",
  "dk",
  "fi",
  "ie",
  "cz",
  "ro",
  "hu",
  "gr",
  "cat",
  "ru",
  "com.ua",
  "com.ng",
  "com.bd",
  "co.th",
]);

const LOCATION_QUERY_KEYS = [
  "q",
  "query",
  "cid",
  "ll",
  "daddr",
  "destination",
  "sll",
  "place_id",
  "query_place_id",
] as const;

const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{10,256}$/;
const MAPS_SHORT_CODE = /^\/[A-Za-z0-9_-]{4,128}\/?$/;
const LEGACY_MAPS_SHORT = /^\/maps\/[A-Za-z0-9_-]{4,128}\/?$/;
const GPAGE_REVIEW =
  /^\/(?:r\/[A-Za-z0-9_-]{4,128}|[A-Za-z0-9][A-Za-z0-9-]{1,80})\/review\/?$/i;

export const linkIssueMessage: Record<LinkIssue, string> = {
  empty: "Pegá el enlace de Google.",
  "too-long":
    "El enlace es demasiado largo para un QR confiable. En Google Maps, usá Compartir y copiá el enlace corto.",
  "unsafe-characters":
    "El enlace tiene espacios o caracteres que no podemos aceptar. Copialo de nuevo desde Google, sin texto extra.",
  "invalid-url": "Eso no es un enlace válido. Copiá la URL completa, con https://.",
  "insecure-protocol":
    "El enlace tiene que empezar con https://. No aceptamos HTTP ni otros protocolos.",
  credentials: "El enlace no puede incluir usuario ni contraseña.",
  port: "El enlace usa un puerto que no corresponde a HTTPS.",
  punycode:
    "No aceptamos dominios internacionalizados ni direcciones escritas para parecerse a Google.",
  "not-google":
    "Solo aceptamos enlaces HTTPS de Google Maps o del formulario oficial para escribir una reseña.",
  "unsupported-google-domain":
    "No aceptamos ese dominio. En Google Maps, tocá Compartir y copiá el enlace que empieza con https://maps.app.goo.gl/.",
  "unsupported-short-link":
    "Ese enlace corto no es de Google Maps. Copiá el enlace desde Compartir en el mapa.",
  "incomplete-short-link": "El enlace corto de Google Maps está incompleto.",
  "generic-maps":
    "Este enlace abre Google Maps, pero no una ubicación concreta. Compartí el lugar o la dirección desde el mapa.",
  "not-location": "Este enlace no es una ubicación de Google Maps.",
  "review-instead-of-location":
    "Este enlace abre el formulario de reseña. Cambiá el objetivo a reseña, o pegá el enlace de la ubicación.",
  "location-instead-of-review":
    "Este enlace abre una ubicación en Google Maps. No abre el formulario para escribir una reseña. Copiá el enlace desde “Pedir reseñas” en el Perfil de Empresa.",
  "not-review": "Este enlace de Google no abre el formulario para escribir una reseña.",
  "gpage-not-review":
    "Este enlace de g.page no termina en /review, así que no lo tomamos como formulario de reseña.",
  "business-profile":
    "Esta es la dirección del Perfil de Empresa, no el enlace para reseñar ni el de la ubicación. Entrá a “Pedir reseñas” y copiá el enlace que te da Google.",
  "missing-place-id": "Al enlace de reseña le falta el parámetro placeid.",
  "invalid-place-id": "El placeid de ese enlace de reseña no tiene un formato válido.",
};

type GoogleCountryHost = "maps" | "standard" | "unsupported";

type LinkKind =
  | { type: "review" }
  | { type: "review-incomplete"; issue: "missing-place-id" | "invalid-place-id" }
  | { type: "location" }
  | { type: "generic-maps" }
  | { type: "incomplete-short-link" }
  | { type: "unsupported-short-link" }
  | { type: "gpage-not-review" }
  | { type: "business-profile" }
  | { type: "unsupported-google-domain" }
  | { type: "google-other" }
  | { type: "not-google" };

export function isIncompleteHttpsPrefix(input: string): boolean {
  const value = input.trim().toLowerCase();
  return value.length > 0 && "https://".startsWith(value);
}

export function validateGoogleLink(input: string, goal: GoogleLinkGoal): LinkResult {
  const inspected = inspectUrl(input);
  if (!inspected.ok) {
    return { ok: false, issue: inspected.issue };
  }

  const url = inspected.url;
  if (url.href.length > MAX_URL_LENGTH) {
    return { ok: false, issue: "too-long" };
  }

  const kind = classify(url);
  return decision(kind, goal, url.href);
}

function decision(kind: LinkKind, goal: GoogleLinkGoal, href: string): LinkResult {
  if (goal === "ubicacion") {
    if (kind.type === "location") return { ok: true, href, goal };
    if (kind.type === "review" || kind.type === "review-incomplete") {
      return { ok: false, issue: "review-instead-of-location" };
    }
    if (kind.type === "generic-maps") return { ok: false, issue: "generic-maps" };
    if (kind.type === "incomplete-short-link") {
      return { ok: false, issue: "incomplete-short-link" };
    }
    if (kind.type === "unsupported-short-link") {
      return { ok: false, issue: "unsupported-short-link" };
    }
    if (kind.type === "business-profile") return { ok: false, issue: "business-profile" };
    if (kind.type === "unsupported-google-domain") {
      return { ok: false, issue: "unsupported-google-domain" };
    }
    if (kind.type === "gpage-not-review" || kind.type === "google-other") {
      return { ok: false, issue: "not-location" };
    }
    return { ok: false, issue: "not-google" };
  }

  if (kind.type === "review") return { ok: true, href, goal, unverified: true };
  if (kind.type === "review-incomplete") return { ok: false, issue: kind.issue };
  if (
    kind.type === "location" ||
    kind.type === "generic-maps" ||
    kind.type === "incomplete-short-link"
  ) {
    return { ok: false, issue: "location-instead-of-review" };
  }
  if (kind.type === "unsupported-short-link") {
    return { ok: false, issue: "unsupported-short-link" };
  }
  if (kind.type === "gpage-not-review") return { ok: false, issue: "gpage-not-review" };
  if (kind.type === "business-profile") return { ok: false, issue: "business-profile" };
  if (kind.type === "unsupported-google-domain") {
    return { ok: false, issue: "unsupported-google-domain" };
  }
  if (kind.type === "google-other") return { ok: false, issue: "not-review" };
  return { ok: false, issue: "not-google" };
}

function inspectUrl(
  input: string,
): { ok: true; url: URL } | { ok: false; issue: LinkIssue } {
  const trimmed = input.trim();

  if (!trimmed) return { ok: false, issue: "empty" };
  if (trimmed.length > MAX_URL_LENGTH) return { ok: false, issue: "too-long" };
  if (/[\u0000-\u001F\u007F\s\\<>"'`]/.test(trimmed) || /%0a|%0d|%00/i.test(trimmed)) {
    return { ok: false, issue: "unsafe-characters" };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, issue: "invalid-url" };
  }

  if (url.protocol !== "https:") return { ok: false, issue: "insecure-protocol" };
  if (url.username || url.password) return { ok: false, issue: "credentials" };

  const authority = trimmed.replace(/^https:\/\//i, "").split(/[/?#]/)[0] ?? "";
  if (authority.includes("@")) return { ok: false, issue: "credentials" };
  if (url.port) return { ok: false, issue: "port" };

  const hostname = url.hostname;
  if (hostname.includes("xn--")) return { ok: false, issue: "punycode" };
  if (!/^[a-z0-9.-]+$/.test(hostname) || hostname.startsWith(".") || hostname.endsWith(".")) {
    return { ok: false, issue: "not-google" };
  }

  return { ok: true, url };
}

function classify(url: URL): LinkKind {
  const hostname = url.hostname;

  if (hostname === "maps.app.goo.gl") {
    return MAPS_SHORT_CODE.test(url.pathname)
      ? { type: "location" }
      : { type: "incomplete-short-link" };
  }

  if (hostname === "goo.gl") {
    return LEGACY_MAPS_SHORT.test(url.pathname)
      ? { type: "location" }
      : { type: "unsupported-short-link" };
  }

  if (hostname === "g.page" || hostname === "www.g.page") {
    return GPAGE_REVIEW.test(url.pathname)
      ? { type: "review" }
      : { type: "gpage-not-review" };
  }

  if (hostname === "business.google.com" || hostname === "www.business.google.com") {
    return { type: "business-profile" };
  }

  const countryHost = classifyGoogleCountryHost(hostname);
  if (countryHost === "unsupported") return { type: "unsupported-google-domain" };

  if (hostname === "search.google.com" || countryHost === "maps" || countryHost === "standard") {
    const review = classifyReviewPath(url);
    if (review === "valid") return { type: "review" };
    if (review) return { type: "review-incomplete", issue: review };
  }

  if (countryHost === "maps" || countryHost === "standard") {
    if (isSpecificMapsLocation(url, countryHost)) return { type: "location" };
    if (isMapsSurface(url, countryHost)) return { type: "generic-maps" };
    return { type: "google-other" };
  }

  if (hostname === "search.google.com" || looksLikeGoogleHost(hostname)) {
    return { type: "google-other" };
  }

  return { type: "not-google" };
}

function classifyGoogleCountryHost(hostname: string): GoogleCountryHost | null {
  const match = /^(?:(maps|www)\.)?google\.([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/.exec(hostname);
  if (!match) return null;

  const suffix = match[2] ?? "";
  if (!suffix || suffix.includes("..") || suffix.startsWith("-") || suffix.endsWith("-")) {
    return null;
  }

  if (!GOOGLE_PUBLIC_SUFFIXES.has(suffix)) return "unsupported";
  return match[1] === "maps" ? "maps" : "standard";
}

function classifyReviewPath(
  url: URL,
): "valid" | "missing-place-id" | "invalid-place-id" | null {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/local/writereview") return null;

  const placeId = url.searchParams.get("placeid")?.trim() ?? "";
  if (!placeId) return "missing-place-id";
  if (!PLACE_ID_PATTERN.test(placeId)) return "invalid-place-id";
  return "valid";
}

function isSpecificMapsLocation(url: URL, hostKind: "maps" | "standard"): boolean {
  if (!isMapsSurface(url, hostKind)) return false;

  const path = url.pathname;
  if (/^\/maps\/(?:place|search|dir)\/.+/.test(path)) return true;
  if (/^\/maps\/@.+/.test(path)) return true;
  if (hostKind === "maps" && /^\/@.+/.test(path)) return true;
  return hasLocationQuery(url);
}

function isMapsSurface(url: URL, hostKind: "maps" | "standard"): boolean {
  const path = url.pathname;
  const mapsPath = path === "/maps" || path.startsWith("/maps/");
  if (hostKind === "maps") return path === "/" || mapsPath;
  return mapsPath;
}

function hasLocationQuery(url: URL): boolean {
  return LOCATION_QUERY_KEYS.some((key) => {
    const value = url.searchParams.get(key);
    return Boolean(value && value.trim());
  });
}

function looksLikeGoogleHost(hostname: string): boolean {
  if (
    hostname === "search.google.com" ||
    hostname.endsWith(".search.google.com") ||
    hostname === "g.page" ||
    hostname.endsWith(".g.page") ||
    hostname === "goo.gl" ||
    hostname.endsWith(".goo.gl")
  ) {
    return true;
  }

  for (const suffix of GOOGLE_PUBLIC_SUFFIXES) {
    const root = `google.${suffix}`;
    if (hostname === root || hostname.endsWith(`.${root}`)) return true;
  }

  return false;
}
