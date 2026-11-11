/**
 * What a QR code can carry in AtajoLab QR: builds the encoded text for each
 * content type and inspects an encoded text before it is printed.
 *
 * Client-safe and deterministic. Nothing here talks to a network: a QR made
 * from these values is static and keeps working without AtajoLab.
 */
import { isGoogleBusinessShareLink, linkIssueMessage, validateGoogleLink } from "@/lib/google-link";

/** Longest text a Studio QR element stores (MAX_QR_VALUE in lib/studio/types.ts). */
export const QR_VALUE_MAX = 500;
export const QR_TEXT_MAX = 300;
export const WHATSAPP_MESSAGE_MAX = 200;
export const CONTACT_FIELD_MAX = 60;

export type QrContentType =
  | "url"
  | "social"
  | "whatsapp"
  | "maps"
  | "review"
  | "menu"
  | "event"
  | "wifi"
  | "vcard"
  | "text";

export type SocialNetwork = "instagram" | "tiktok" | "facebook" | "youtube" | "x" | "linkedin" | "otra";
export type WifiSecurity = "WPA" | "WEP" | "nopass";
export type MenuKind = "menu" | "catalogo";

export type QrContentInput =
  | { type: "url"; url: string }
  | { type: "social"; network: SocialNetwork; handle: string }
  | { type: "whatsapp"; phone: string; message: string }
  | { type: "maps"; url: string }
  | { type: "review"; url: string }
  | { type: "menu"; kind: MenuKind; url: string }
  | { type: "event"; url: string }
  | { type: "wifi"; ssid: string; password: string; security: WifiSecurity; hidden: boolean }
  | { type: "vcard"; name: string; phone: string; email: string; org: string; url: string }
  | { type: "text"; text: string };

export type QrContentResult =
  | {
      ok: true;
      /** Exact text encoded in the QR. */
      value: string;
      /** Short human line about the destination ("@usuario", "Red: Casa", a host). */
      detail: string;
    }
  | { ok: false; field: string; message: string };

export const qrContentTypes: { id: QrContentType; name: string; hint: string }[] = [
  { id: "url", name: "Sitio web o enlace", hint: "Cualquier página" },
  { id: "social", name: "Instagram, TikTok y redes", hint: "Tu perfil" },
  { id: "whatsapp", name: "WhatsApp", hint: "Chat con mensaje listo" },
  { id: "review", name: "Reseñas de Google", hint: "Que opinen de vos" },
  { id: "maps", name: "Google Maps", hint: "Cómo llegar" },
  { id: "menu", name: "Menú o catálogo", hint: "Tu carta online" },
  { id: "event", name: "Evento", hint: "Invitación o entradas" },
  { id: "wifi", name: "Wi-Fi", hint: "Conexión sin tipear" },
  { id: "vcard", name: "Contacto", hint: "Tarjeta para agendar" },
  { id: "text", name: "Texto", hint: "Un mensaje corto" },
];

type NetworkSpec = {
  name: string;
  hosts: string[];
  handle: RegExp;
  url(handle: string): string;
};

const NETWORKS: Record<Exclude<SocialNetwork, "otra">, NetworkSpec> = {
  instagram: {
    name: "Instagram",
    hosts: ["instagram.com"],
    handle: /^[A-Za-z0-9._]{1,30}$/,
    url: (handle) => `https://www.instagram.com/${handle}/`,
  },
  tiktok: {
    name: "TikTok",
    hosts: ["tiktok.com"],
    handle: /^[A-Za-z0-9._]{2,24}$/,
    url: (handle) => `https://www.tiktok.com/@${handle}`,
  },
  facebook: {
    name: "Facebook",
    hosts: ["facebook.com", "fb.com", "fb.me"],
    handle: /^[A-Za-z0-9.]{3,50}$/,
    url: (handle) => `https://www.facebook.com/${handle}`,
  },
  youtube: {
    name: "YouTube",
    hosts: ["youtube.com", "youtu.be"],
    handle: /^[A-Za-z0-9._-]{3,30}$/,
    url: (handle) => `https://www.youtube.com/@${handle}`,
  },
  x: {
    name: "X",
    hosts: ["x.com", "twitter.com"],
    handle: /^[A-Za-z0-9_]{1,15}$/,
    url: (handle) => `https://x.com/${handle}`,
  },
  linkedin: {
    name: "LinkedIn",
    hosts: ["linkedin.com"],
    handle: /^[A-Za-z0-9-]{3,100}$/,
    url: (handle) => `https://www.linkedin.com/in/${handle}/`,
  },
};

export const socialNetworks: { id: SocialNetwork; name: string }[] = [
  { id: "instagram", name: "Instagram" },
  { id: "tiktok", name: "TikTok" },
  { id: "facebook", name: "Facebook" },
  { id: "youtube", name: "YouTube" },
  { id: "x", name: "X" },
  { id: "linkedin", name: "LinkedIn" },
  { id: "otra", name: "Otra" },
];

export function socialNetworkName(network: SocialNetwork): string {
  return network === "otra" ? "redes" : NETWORKS[network].name;
}

export function emptyQrContent(type: QrContentType): QrContentInput {
  if (type === "social") return { type, network: "instagram", handle: "" };
  if (type === "whatsapp") return { type, phone: "", message: "" };
  if (type === "menu") return { type, kind: "menu", url: "" };
  if (type === "wifi") return { type, ssid: "", password: "", security: "WPA", hidden: false };
  if (type === "vcard") return { type, name: "", phone: "", email: "", org: "", url: "" };
  if (type === "text") return { type, text: "" };
  return { type, url: "" };
}

export function buildQrContent(input: QrContentInput): QrContentResult {
  if (input.type === "url" || input.type === "menu" || input.type === "event") {
    const link = cleanWebUrl(input.url);
    if (!link.ok) return { ok: false, field: "url", message: link.message };
    return { ok: true, value: link.href, detail: hostLabel(link.href) };
  }
  if (input.type === "social") return buildSocial(input.network, input.handle);
  if (input.type === "whatsapp") return buildWhatsapp(input.phone, input.message);
  if (input.type === "maps") return buildGoogle(input.url, "ubicacion");
  if (input.type === "review") return buildGoogle(input.url, "resena");
  if (input.type === "wifi") return buildWifi(input);
  if (input.type === "vcard") return buildVcard(input);
  return buildText(input.text);
}

type CleanUrl = { ok: true; href: string } | { ok: false; message: string };

/** Accepts "midominio.com" as well as a full address and returns a safe http(s) link. */
export function cleanWebUrl(raw: string): CleanUrl {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, message: "Pegá o escribí el enlace." };
  if (/[\u0000-\u001F\u007F\s\\<>"'`]/.test(trimmed)) {
    return { ok: false, message: "El enlace no puede tener espacios ni comillas. Copialo de nuevo." };
  }
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    if (candidate.includes("://")) {
      return { ok: false, message: "El enlace tiene que empezar con https://." };
    }
    candidate = `https://${candidate}`;
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, message: "Eso no parece un enlace. Revisá que esté completo." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, message: "El enlace tiene que empezar con https://." };
  }
  if (url.username || url.password || candidate.replace(/^https?:\/\//i, "").split(/[/?#]/)[0]!.includes("@")) {
    return { ok: false, message: "El enlace no puede incluir un usuario ni una contraseña." };
  }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(url.hostname)) {
    return { ok: false, message: "Eso no parece un enlace. Revisá el nombre del sitio." };
  }
  if (url.href.length > QR_VALUE_MAX) {
    return { ok: false, message: "Ese enlace es muy largo para un QR. Usá una versión más corta." };
  }
  return { ok: true, href: url.href };
}

function buildSocial(network: SocialNetwork, raw: string): QrContentResult {
  const value = raw.trim();
  if (network === "otra") {
    const link = cleanWebUrl(value);
    if (!link.ok) return { ok: false, field: "handle", message: link.message };
    return { ok: true, value: link.href, detail: hostLabel(link.href) };
  }
  const spec = NETWORKS[network];
  if (!value) return { ok: false, field: "handle", message: `Escribí tu usuario de ${spec.name} o pegá el enlace de tu perfil.` };

  const looksLikeLink = /^https?:\/\//i.test(value) || spec.hosts.some((host) => value.toLowerCase().includes(`${host}/`));
  if (looksLikeLink) {
    const link = cleanWebUrl(value);
    if (!link.ok) return { ok: false, field: "handle", message: link.message };
    const url = new URL(link.href);
    const host = url.hostname.replace(/^(www|m|vm)\./, "");
    if (!spec.hosts.includes(host)) {
      return { ok: false, field: "handle", message: `Ese enlace no es de ${spec.name}. Pegá el de tu perfil.` };
    }
    if (url.pathname === "/" && !url.search) {
      return { ok: false, field: "handle", message: `Ese enlace abre la portada de ${spec.name}. Pegá el de tu perfil.` };
    }
    return { ok: true, value: link.href, detail: profileLabel(url) };
  }

  const handle = value.replace(/^@+/, "");
  if (!spec.handle.test(handle)) {
    return {
      ok: false,
      field: "handle",
      message: "Ese usuario no parece válido. Escribilo sin espacios, como aparece en tu perfil.",
    };
  }
  return { ok: true, value: spec.url(handle), detail: `@${handle}` };
}

function buildWhatsapp(rawPhone: string, rawMessage: string): QrContentResult {
  const phone = rawPhone.trim();
  if (!phone) return { ok: false, field: "phone", message: "Escribí el número de WhatsApp." };
  if (!/^[\d\s().+-]+$/.test(phone)) {
    return { ok: false, field: "phone", message: "El número solo puede tener dígitos, espacios y el signo +." };
  }
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) {
    return {
      ok: false,
      field: "phone",
      message: "Escribí el número con código de país y sin el 0 inicial. Por ejemplo: 54 9 11 2345 6789.",
    };
  }
  if (digits.length < 8 || digits.length > 15) {
    return {
      ok: false,
      field: "phone",
      message: "Revisá el número: va con código de país, por ejemplo 54 9 11 2345 6789.",
    };
  }
  const message = rawMessage.trim();
  if (message.length > WHATSAPP_MESSAGE_MAX) {
    return { ok: false, field: "message", message: `El mensaje puede tener hasta ${WHATSAPP_MESSAGE_MAX} caracteres.` };
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(message)) {
    return { ok: false, field: "message", message: "El mensaje tiene caracteres que no se pueden usar." };
  }
  const value = message ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : `https://wa.me/${digits}`;
  if (value.length > QR_VALUE_MAX) {
    return { ok: false, field: "message", message: "El mensaje es muy largo para un QR. Acortalo un poco." };
  }
  return { ok: true, value, detail: `+${digits}` };
}

function buildGoogle(raw: string, goal: "ubicacion" | "resena"): QrContentResult {
  const trimmed = raw.trim();
  const link = validateGoogleLink(trimmed, goal);
  let href: string | null = link.ok ? link.href : null;
  if (!href && isGoogleBusinessShareLink(trimmed)) href = trimmed;
  if (!href) {
    return { ok: false, field: "url", message: link.ok ? linkIssueMessage["invalid-url"] : linkIssueMessage[link.issue] };
  }
  if (href.length > QR_VALUE_MAX) {
    return {
      ok: false,
      field: "url",
      message: "Ese enlace es muy largo para un QR. En Google Maps, usá Compartir y copiá el enlace corto.",
    };
  }
  return { ok: true, value: href, detail: "" };
}

function buildWifi(input: Extract<QrContentInput, { type: "wifi" }>): QrContentResult {
  const ssid = input.ssid;
  if (!ssid.trim()) return { ok: false, field: "ssid", message: "Escribí el nombre de la red." };
  if (/[\u0000-\u001F\u007F]/.test(ssid)) {
    return { ok: false, field: "ssid", message: "El nombre de la red tiene caracteres que no se pueden usar." };
  }
  if (new TextEncoder().encode(ssid).length > 32) {
    return { ok: false, field: "ssid", message: "El nombre de la red puede tener hasta 32 caracteres." };
  }
  const password = input.password;
  if (input.security !== "nopass") {
    if (!password) return { ok: false, field: "password", message: "Escribí la contraseña de la red." };
    if (/[\u0000-\u001F\u007F]/.test(password)) {
      return { ok: false, field: "password", message: "La contraseña tiene caracteres que no se pueden usar." };
    }
    if (input.security === "WPA" && (password.length < 8 || password.length > 64)) {
      return { ok: false, field: "password", message: "La contraseña WPA tiene entre 8 y 63 caracteres." };
    }
    if (input.security === "WEP" && ![5, 10, 13, 26].includes(password.length)) {
      return { ok: false, field: "password", message: "La clave WEP tiene 5, 10, 13 o 26 caracteres." };
    }
  }
  const parts = [`T:${input.security}`, `S:${escapeWifi(ssid)}`];
  if (input.security !== "nopass") parts.push(`P:${escapeWifi(password)}`);
  if (input.hidden) parts.push("H:true");
  return { ok: true, value: `WIFI:${parts.join(";")};;`, detail: `Red: ${ssid.trim()}` };
}

function buildVcard(input: Extract<QrContentInput, { type: "vcard" }>): QrContentResult {
  const name = oneLine(input.name);
  if (!name) return { ok: false, field: "name", message: "Escribí el nombre del contacto." };
  if (name.length > CONTACT_FIELD_MAX) {
    return { ok: false, field: "name", message: `El nombre puede tener hasta ${CONTACT_FIELD_MAX} caracteres.` };
  }
  const org = oneLine(input.org);
  if (org.length > CONTACT_FIELD_MAX) {
    return { ok: false, field: "org", message: `La empresa puede tener hasta ${CONTACT_FIELD_MAX} caracteres.` };
  }

  let phone = "";
  if (input.phone.trim()) {
    const raw = input.phone.trim();
    const digits = raw.replace(/\D/g, "");
    if (!/^[\d\s().+-]+$/.test(raw) || digits.length < 6 || digits.length > 15) {
      return { ok: false, field: "phone", message: "Revisá el teléfono: solo dígitos, espacios y el signo +." };
    }
    phone = raw.startsWith("+") ? `+${digits}` : digits;
  }

  const email = input.email.trim();
  if (email && (email.length > 120 || !/^[^\s@<>()[\],;:\\"]+@[^\s@<>()[\],;:\\"]+\.[A-Za-z]{2,}$/.test(email))) {
    return { ok: false, field: "email", message: "Revisá el correo. Tiene que ser una dirección válida." };
  }

  let site = "";
  if (input.url.trim()) {
    const link = cleanWebUrl(input.url);
    if (!link.ok) return { ok: false, field: "url", message: link.message };
    site = link.href;
  }

  if (!phone && !email && !site) {
    return { ok: false, field: "phone", message: "Sumá al menos un teléfono, un correo o un sitio web." };
  }

  const words = name.split(" ");
  const family = words.length > 1 ? words[words.length - 1]! : "";
  const given = words.length > 1 ? words.slice(0, -1).join(" ") : name;
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escapeVcard(family)};${escapeVcard(given)};;;`,
    `FN:${escapeVcard(name)}`,
  ];
  if (org) lines.push(`ORG:${escapeVcard(org)}`);
  if (phone) lines.push(`TEL;TYPE=CELL:${phone}`);
  if (email) lines.push(`EMAIL:${email}`);
  if (site) lines.push(`URL:${site}`);
  lines.push("END:VCARD");
  const value = lines.join("\n");
  if (value.length > QR_VALUE_MAX) {
    return { ok: false, field: "url", message: "Son muchos datos para un QR. Acortá el sitio web o la empresa." };
  }
  return { ok: true, value, detail: phone || email || hostLabel(site) };
}

function buildText(raw: string): QrContentResult {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return { ok: false, field: "text", message: "Escribí el texto que va a mostrar el QR." };
  if (text.length > QR_TEXT_MAX) {
    return { ok: false, field: "text", message: `El texto puede tener hasta ${QR_TEXT_MAX} caracteres.` };
  }
  if (/[\u0000-\u0009\u000B-\u001F\u007F]/.test(text)) {
    return { ok: false, field: "text", message: "El texto tiene caracteres que no se pueden usar." };
  }
  const inspected = inspectQrPayload(text);
  if (inspected.issue) return { ok: false, field: "text", message: inspected.issue };
  return { ok: true, value: text, detail: "" };
}

/* ------------------------------------------------------------------ */
/* Reading an encoded value back                                       */
/* ------------------------------------------------------------------ */

export type QrPayloadKind = "url" | "wifi" | "vcard" | "text";

export type QrPayloadInspection = {
  kind: QrPayloadKind;
  /** Why this text must not be printed as it is. */
  issue: string | null;
  /** Advice that does not block. */
  hint: string | null;
};

/** Checks the text a QR element holds, whatever wrote it (guided flow or the editor). */
export function inspectQrPayload(raw: string): QrPayloadInspection {
  const value = raw.trim();

  if (/^WIFI:/i.test(value)) {
    const wifi = parseWifi(value);
    return {
      kind: "wifi",
      issue: wifi && wifi.ssid ? null : "Al QR de Wi-Fi le falta el nombre de la red. Volvé a cargar los datos.",
      hint: null,
    };
  }

  if (/^BEGIN:VCARD/i.test(value)) {
    const complete = /\nEND:VCARD$/i.test(value) && /\nFN:[^\n]*\S/i.test(value);
    return {
      kind: "vcard",
      issue: complete ? null : "El contacto del QR está incompleto. Volvé a cargar los datos.",
      hint: null,
    };
  }

  if (/^https?:/i.test(value)) {
    return {
      kind: "url",
      issue: isSafeWebUrl(value)
        ? null
        : "El enlace del QR no es válido. Tiene que empezar con https:// y no tener espacios.",
      hint: null,
    };
  }

  if (/^(javascript|data|vbscript|file|blob):/i.test(value)) {
    return { kind: "text", issue: "Ese contenido no se puede usar en un código QR.", hint: null };
  }

  const bareLink = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(value);
  return {
    kind: "text",
    issue: null,
    hint: bareLink ? "Parece un enlace sin https://. Agregalo al principio para que se abra al escanear." : null,
  };
}

function isSafeWebUrl(value: string): boolean {
  if (/[\u0000-\u001F\u007F\s\\<>"`]/.test(value)) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  return url.hostname.length > 0;
}

/** One line for people: "Wi-Fi · Casa", "WhatsApp · +54…", "Enlace · sitio.com". */
export function describeQrPayload(raw: string): string {
  const value = raw.trim();
  if (!value) return "Sin contenido";
  const inspected = inspectQrPayload(value);
  if (inspected.kind === "wifi") {
    const wifi = parseWifi(value);
    return wifi?.ssid ? `Wi-Fi · ${wifi.ssid}` : "Wi-Fi";
  }
  if (inspected.kind === "vcard") {
    const contact = parseVcard(value);
    return contact.name ? `Contacto · ${contact.name}` : "Contacto";
  }
  if (inspected.kind === "text") return "Texto";
  if (inspected.issue) return "Enlace";

  const url = new URL(value);
  const host = url.hostname.replace(/^www\./, "");
  if (host === "wa.me") return `WhatsApp · +${url.pathname.replace(/\D/g, "")}`;
  if (validateGoogleLink(value, "resena").ok) return "Reseñas de Google";
  if (validateGoogleLink(value, "ubicacion").ok) return "Google Maps";
  if (isGoogleBusinessShareLink(value)) return "Perfil de Google";
  for (const spec of Object.values(NETWORKS)) {
    if (spec.hosts.includes(host)) return `${spec.name} · ${profileLabel(url)}`;
  }
  return `Enlace · ${host}`;
}

/** Fields to edit an existing QR again. Unknown shapes come back as a link or as text. */
export function decodeQrContent(raw: string): QrContentInput {
  const value = raw.trim();
  if (!value) return { type: "url", url: "" };
  const inspected = inspectQrPayload(value);

  if (inspected.kind === "wifi") {
    const wifi = parseWifi(value);
    const security: WifiSecurity =
      wifi?.security === "nopass" || (!wifi?.security && !wifi?.password)
        ? "nopass"
        : wifi?.security === "WEP"
          ? "WEP"
          : "WPA";
    return {
      type: "wifi",
      ssid: wifi?.ssid ?? "",
      password: wifi?.password ?? "",
      security,
      hidden: wifi?.hidden ?? false,
    };
  }

  if (inspected.kind === "vcard") return { type: "vcard", ...parseVcard(value) };

  if (inspected.kind === "url" && !inspected.issue) {
    const url = new URL(value);
    if (url.hostname === "wa.me") {
      return {
        type: "whatsapp",
        phone: url.pathname.replace(/\D/g, ""),
        message: url.searchParams.get("text") ?? "",
      };
    }
    return { type: "url", url: value };
  }
  if (inspected.kind === "url") return { type: "url", url: value };
  return { type: "text", text: value };
}

type WifiFields = { ssid: string; password: string; security: string; hidden: boolean };

function parseWifi(value: string): WifiFields | null {
  if (!/^WIFI:/i.test(value)) return null;
  const fields: WifiFields = { ssid: "", password: "", security: "", hidden: false };
  let key = "";
  let current = "";
  let inValue = false;
  const body = value.slice(5);
  const flush = () => {
    const name = key.toUpperCase();
    if (name === "S") fields.ssid = current;
    else if (name === "P") fields.password = current;
    else if (name === "T") fields.security = current;
    else if (name === "H") fields.hidden = current.toLowerCase() === "true";
    key = "";
    current = "";
    inValue = false;
  };
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]!;
    if (inValue && char === "\\" && index + 1 < body.length) {
      current += body[index + 1]!;
      index += 1;
    } else if (char === ";") {
      flush();
    } else if (!inValue && char === ":") {
      inValue = true;
    } else if (inValue) {
      current += char;
    } else {
      key += char;
    }
  }
  if (key || current) flush();
  return fields;
}

function parseVcard(value: string): { name: string; phone: string; email: string; org: string; url: string } {
  const contact = { name: "", phone: "", email: "", org: "", url: "" };
  for (const line of value.replace(/\r\n/g, "\n").split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).split(";")[0]!.toUpperCase();
    const content = line.slice(separator + 1);
    if (key === "FN") contact.name = unescapeVcard(content);
    else if (key === "ORG") contact.org = unescapeVcard(content);
    else if (key === "TEL" && !contact.phone) contact.phone = content.trim();
    else if (key === "EMAIL" && !contact.email) contact.email = content.trim();
    else if (key === "URL" && !contact.url) contact.url = content.trim();
  }
  return contact;
}

function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

function escapeVcard(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1");
}

function unescapeVcard(value: string): string {
  return value.replace(/\\([\\,;])/g, "$1").replace(/\\n/gi, " ").trim();
}

function oneLine(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
}

function hostLabel(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function profileLabel(url: URL): string {
  const first = url.pathname.split("/").filter(Boolean)[0] ?? "";
  if (!first || /^(in|company|channel|c|user|profile\.php|p|share)$/i.test(first)) {
    return url.hostname.replace(/^www\./, "");
  }
  return first.startsWith("@") ? first : `@${first}`;
}

/* ------------------------------------------------------------------ */
/* Untrusted input (API bodies, saved wizard state)                    */
/* ------------------------------------------------------------------ */

const NETWORK_IDS = new Set<string>(socialNetworks.map((network) => network.id));

/** Shape check for JSON from a client. Field rules live in buildQrContent. */
export function readQrContentInput(value: unknown): QrContentInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const text = (key: string, max = 2000): string | null => {
    const field = record[key];
    return typeof field === "string" && field.length <= max ? field : null;
  };
  const type = record.type;

  if (type === "url" || type === "maps" || type === "review" || type === "event") {
    const url = text("url");
    return url === null ? null : { type, url };
  }
  if (type === "menu") {
    const url = text("url");
    if (url === null || (record.kind !== "menu" && record.kind !== "catalogo")) return null;
    return { type, kind: record.kind, url };
  }
  if (type === "social") {
    const handle = text("handle");
    if (handle === null || typeof record.network !== "string" || !NETWORK_IDS.has(record.network)) return null;
    return { type, network: record.network as SocialNetwork, handle };
  }
  if (type === "whatsapp") {
    const phone = text("phone", 40);
    const message = text("message", 1000);
    return phone === null || message === null ? null : { type, phone, message };
  }
  if (type === "wifi") {
    const ssid = text("ssid", 100);
    const password = text("password", 100);
    if (ssid === null || password === null || typeof record.hidden !== "boolean") return null;
    if (record.security !== "WPA" && record.security !== "WEP" && record.security !== "nopass") return null;
    return { type, ssid, password, security: record.security, hidden: record.hidden };
  }
  if (type === "vcard") {
    const name = text("name", 200);
    const phone = text("phone", 40);
    const email = text("email", 200);
    const org = text("org", 200);
    const url = text("url");
    if (name === null || phone === null || email === null || org === null || url === null) return null;
    return { type, name, phone, email, org, url };
  }
  if (type === "text") {
    const body = text("text", 1000);
    return body === null ? null : { type, text: body };
  }
  return null;
}
