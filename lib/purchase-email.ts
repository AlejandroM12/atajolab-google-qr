import { formatArs } from "@/lib/pricing";

/** The access link in the purchase mail lives long enough to be opened days later (see access-link.ts). */
export const PURCHASE_LINK_DAYS = 7;

const BRAND = {
  accent: "#0f6e62",
  accentStrong: "#0b5348",
  background: "#f3f0e8",
  foreground: "#14221f",
  muted: "#5c675f",
  line: "#e4dccb",
  card: "#ffffff",
  okBg: "#e6f1ee",
} as const;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export type PurchaseEmailFile = {
  format: "png" | "svg" | "pdf";
  /** Unknown when the files could not be rendered: the mail then names only the formats. */
  filename: string | null;
  bytes: number | null;
};

export type PurchaseEmailInput = {
  origin: string;
  label: string;
  publicId: string;
  amountArs: number;
  currency: string;
  paidAt: Date | null;
  /** One-time link to the order page; never a permanent file URL. */
  accessUrl: string;
  files: PurchaseEmailFile[];
  /** The files travel inside this message. When false the button is the way to get them. */
  attached: boolean;
  supportEmail: string | null;
};

export type PurchaseEmail = { subject: string; text: string; html: string };

const FORMAT_INFO: Record<PurchaseEmailFile["format"], { name: string; hint: string }> = {
  png: { name: "PNG", hint: "Para imprimir en casa o publicar en redes" },
  pdf: { name: "PDF", hint: "Para llevar a la imprenta" },
  svg: { name: "SVG", hint: "Para un diseñador o para editar" },
};

const FORMAT_ORDER: PurchaseEmailFile["format"][] = ["png", "pdf", "svg"];

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanLine(value: string, max: number): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
}

function fileTitle(file: PurchaseEmailFile): string {
  const name = FORMAT_INFO[file.format].name;
  if (!file.filename) return name;
  return file.bytes === null ? `${file.filename} (${name})` : `${file.filename} (${name}, ${formatSize(file.bytes)})`;
}

function sortedFiles(files: PurchaseEmailFile[]): PurchaseEmailFile[] {
  return [...files].sort((a, b) => FORMAT_ORDER.indexOf(a.format) - FORMAT_ORDER.indexOf(b.format));
}

/** Absolute URL of the public brand logo (a static PNG: Gmail does not render SVG). */
export function purchaseLogoUrl(origin: string): string {
  return new URL("/brand/atajolab-logo-email.png", origin).href;
}

/**
 * The purchase confirmation: HTML (tables and inline styles, one 600px column that shrinks on a phone)
 * and its plain-text alternative. Contains no draft key, asset id or permanent file URL.
 */
export function buildPurchaseEmail(input: PurchaseEmailInput): PurchaseEmail {
  const label = cleanLine(input.label, 80) || "Tu diseño";
  const publicId = cleanLine(input.publicId, 40);
  const amount = `${formatArs(input.amountArs)} ${input.currency}`;
  const date = input.paidAt ? formatDate(input.paidAt) : null;
  const files = sortedFiles(input.files);
  const support = input.supportEmail ? cleanLine(input.supportEmail, 120) : null;
  const supportUrl = new URL("/contacto", input.origin).href;
  const recoverUrl = new URL("/recuperar", input.origin).href;
  const subject = "Tu compra en AtajoLab QR está confirmada";

  const filesIntro = input.attached
    ? "Adjuntamos a este correo los tres archivos de tu diseño:"
    : "Tus tres archivos están listos para descargar con el botón de abajo:";
  const buttonNote = input.attached
    ? `Si preferís no guardar los adjuntos, o los perdés, con este botón volvés a bajarlos. El enlace funciona una vez y vence en ${PURCHASE_LINK_DAYS} días.`
    : `El enlace funciona una vez y vence en ${PURCHASE_LINK_DAYS} días. Después podés pedir uno nuevo con tu correo.`;

  const text = [
    "Compra confirmada · AtajoLab QR",
    "",
    "¡Gracias por tu compra! Tu pago fue aprobado.",
    "",
    "Datos del pedido",
    `Diseño: ${label}`,
    `Pedido: ${publicId}`,
    ...(date ? [`Fecha: ${date}`] : []),
    `Importe: ${amount}`,
    "",
    filesIntro,
    ...files.map((file) => `- ${fileTitle(file)}: ${FORMAT_INFO[file.format].hint}`),
    "",
    "Descargar mis archivos:",
    input.accessUrl,
    buttonNote,
    "",
    `Si cerrás el navegador o cambiás de dispositivo, pedí un acceso nuevo en ${recoverUrl} con el correo de la compra.`,
    "",
    "Soporte",
    support ? `Escribinos a ${support} o desde ${supportUrl}.` : `Escribinos desde ${supportUrl}.`,
    "Si no reconocés esta compra, ignorá este mensaje.",
  ].join("\n");

  const rows = files
    .map(
      (file) => `<tr>
<td style="padding:10px 0;border-top:1px solid ${BRAND.line};font-family:${FONT};font-size:14px;line-height:20px;color:${BRAND.foreground};">
<strong style="color:${BRAND.accentStrong};">${FORMAT_INFO[file.format].name}</strong>${file.filename ? ` &middot; ${escapeHtml(file.filename)}` : ""}<br>
<span style="color:${BRAND.muted};font-size:13px;">${escapeHtml(FORMAT_INFO[file.format].hint)}${file.bytes === null ? "" : ` &middot; ${formatSize(file.bytes)}`}</span>
</td></tr>`,
    )
    .join("\n");

  const detail = (name: string, value: string) => `<tr>
<td style="padding:6px 0;font-family:${FONT};font-size:14px;line-height:20px;color:${BRAND.muted};width:36%;vertical-align:top;">${name}</td>
<td style="padding:6px 0;font-family:${FONT};font-size:14px;line-height:20px;color:${BRAND.foreground};font-weight:600;vertical-align:top;word-break:break-word;">${value}</td>
</tr>`;

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.background};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Tu pago fue aprobado. Tus archivos PNG, SVG y PDF ${input.attached ? "van adjuntos" : "están listos para descargar"}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.background};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
<tr><td align="left" style="padding:0 4px 16px 4px;">
<a href="${escapeHtml(new URL("/", input.origin).href)}" style="text-decoration:none;"><img src="${escapeHtml(purchaseLogoUrl(input.origin))}" width="168" height="30" alt="AtajoLab QR" style="display:block;border:0;outline:none;height:30px;width:168px;"></a>
</td></tr>
<tr><td style="background:${BRAND.card};border:1px solid ${BRAND.line};border-radius:20px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="background:${BRAND.accent};padding:22px 28px;">
<div style="font-family:${FONT};font-size:12px;line-height:16px;letter-spacing:1.4px;text-transform:uppercase;color:#cfe7e2;font-weight:700;">Compra confirmada</div>
<div style="font-family:${FONT};font-size:24px;line-height:30px;color:#ffffff;font-weight:700;padding-top:4px;">¡Gracias por tu compra!</div>
</td></tr>
<tr><td style="padding:24px 28px 8px 28px;font-family:${FONT};font-size:15px;line-height:23px;color:${BRAND.foreground};">
Tu pago fue aprobado y tu diseño está listo para usar. Guardá este correo: es tu comprobante y tu acceso de respaldo.
</td></tr>
<tr><td style="padding:8px 28px 0 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.okBg};border-radius:14px;">
<tr><td style="padding:14px 18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${detail("Diseño", escapeHtml(label))}
${detail("Pedido", escapeHtml(publicId))}
${date ? detail("Fecha", escapeHtml(date)) : ""}
${detail("Importe", escapeHtml(amount))}
</table>
</td></tr></table>
</td></tr>
<tr><td style="padding:22px 28px 0 28px;font-family:${FONT};font-size:15px;line-height:23px;color:${BRAND.foreground};">
<strong>Archivos incluidos</strong><br>
<span style="color:${BRAND.muted};font-size:14px;">${escapeHtml(filesIntro)}</span>
</td></tr>
<tr><td style="padding:6px 28px 0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows}
</table></td></tr>
<tr><td align="center" style="padding:26px 28px 6px 28px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="${BRAND.accent}" style="border-radius:999px;">
<a href="${escapeHtml(input.accessUrl)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">Descargar mis archivos</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:8px 28px 4px 28px;font-family:${FONT};font-size:13px;line-height:19px;color:${BRAND.muted};text-align:center;">
${escapeHtml(buttonNote)}
</td></tr>
<tr><td style="padding:14px 28px 24px 28px;font-family:${FONT};font-size:13px;line-height:19px;color:${BRAND.muted};text-align:center;">
Si cerrás el navegador o cambiás de dispositivo, pedí un acceso nuevo en <a href="${escapeHtml(recoverUrl)}" style="color:${BRAND.accent};">${escapeHtml(recoverUrl.replace(/^https?:\/\//, ""))}</a> con el correo de la compra.
</td></tr>
</table>
</td></tr>
<tr><td style="padding:18px 8px 0 8px;font-family:${FONT};font-size:13px;line-height:20px;color:${BRAND.muted};text-align:center;">
<strong style="color:${BRAND.foreground};">¿Necesitás ayuda?</strong><br>
${support ? `Escribinos a <a href="mailto:${escapeHtml(support)}" style="color:${BRAND.accent};">${escapeHtml(support)}</a> o desde ` : "Escribinos desde "}<a href="${escapeHtml(supportUrl)}" style="color:${BRAND.accent};">${escapeHtml(supportUrl.replace(/^https?:\/\//, ""))}</a>.<br>
Si no reconocés esta compra, ignorá este mensaje.
</td></tr>
<tr><td align="center" style="padding:14px 8px 4px 8px;font-family:${FONT};font-size:12px;line-height:18px;color:${BRAND.muted};">AtajoLab QR</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}
