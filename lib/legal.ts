/**
 * Commercial and legal identity shown on /terminos, /privacidad, /reembolsos,
 * /arrepentimiento and /contacto.
 *
 * Values still wrapped in `pending(...)` render visibly as "[COMPLETAR: …]"
 * and keep production sales closed (`legalDataComplete()`), because the
 * seller must be identified before selling (Ley 24.240). Nothing here was
 * invented: replace them with the real data.
 */

const PENDING_PREFIX = "[COMPLETAR:";

function pending(label: string): string {
  return `${PENDING_PREFIX} ${label}]`;
}

export function isPending(value: string): boolean {
  return value.startsWith(PENDING_PREFIX);
}

export const legal = {
  /** Brand shown to buyers. */
  tradeName: "AtajoLab",
  /** Holder of the business. Confirmed by the owner. */
  legalName: "Alejandro Morel",
  /** CUIT / CUIL. */
  taxId: pending("CUIT válido"),
  /** e.g. "Responsable Inscripto" or "Monotributista". Defines whether prices include IVA. */
  taxCondition: pending("condición fiscal"),
  /** Legal address (domicilio legal / comercial). Never a private home address. */
  address: pending("domicilio legal o comercial"),
  /**
   * City and province shown publicly. Confirmed by the owner. It is NOT a legal
   * address and does not satisfy `address` (sales and the free promo still need it).
   */
  publicLocation: "Formosa, Formosa, Argentina",
  /** Mailbox that receives support and revocation requests. Must be monitored. Confirmed by the owner. */
  supportEmail: "atajolab.tools@gmail.com",
  /** Optional extra channel, e.g. WhatsApp. Leave empty to hide it. */
  supportPhone: "",
  /** Business hours for replies. Confirmed by the owner. */
  supportHours: "Lunes a viernes, de 9:00 a 21:00 (Argentina)",
  /** /terminos: "Jurisdicción: <value>, sin perjuicio de los derechos…". */
  jurisdiction:
    "tribunales competentes de la República Argentina, conforme a la normativa de protección al consumidor y ante las autoridades de aplicación que correspondan",
  /** /privacidad, section "Cuánto tiempo los guardamos". */
  dataRetention:
    "Conservamos el correo electrónico, el diseño y los datos del pago de cada compra para entregarte los archivos, permitirte recuperarlos, atender consultas, reclamos y reembolsos, y cumplir obligaciones contables y fiscales. Los guardamos mientras sean necesarios para esas finalidades y durante los plazos que exija la ley; después los eliminamos o anonimizamos. Podés pedir antes su supresión, salvo los que debamos conservar por obligación legal.",
  /** Date of the last revision of the legal texts. */
  lastUpdated: "4 de noviembre de 2026",
  /** /reembolsos: "Alcance para piezas digitales ya descargadas: <value>." */
  refundDigitalScope:
    "descargar los archivos no elimina por sí solo tu derecho de arrepentimiento; cada solicitud se resuelve según la Ley 24.240 y el Código Civil y Comercial de la Nación",
  /** /reembolsos: "Lo revisamos y te damos una solución: <value>." */
  refundProblemRemedy:
    "si el problema técnico es atribuible a AtajoLab, te enviamos sin cargo un archivo corregido o una nueva descarga, con el objetivo de responderte dentro de las 48 horas hábiles; si no se puede resolver, te reintegramos el pago cuando corresponda",
  /** /reembolsos: "Plazo para procesar el reembolso de nuestro lado: <value>." */
  refundProcessingTime:
    "buscamos iniciar los reembolsos aprobados dentro de los 5 días hábiles, o en un plazo menor si la ley lo exige",
  /** /reembolsos: "Si compraste con un error de tipeo o un enlace equivocado: <value>." */
  designErrorPolicy:
    "podés pedirnos una corrección sin cargo dentro de los 7 días corridos desde la compra, y la hacemos cuando sea técnicamente posible",
  /** /contacto: official national complaint form (Ventanilla Única Federal); it routes each claim to the competent office. Verified 2026-11-04. */
  consumerAuthorityUrl: "https://www.argentina.gob.ar/servicio/iniciar-un-reclamo-ante-defensa-del-consumidor",
} as const;

export function pendingLegalFields(): string[] {
  return Object.entries(legal)
    .filter(([, value]) => typeof value === "string" && isPending(value))
    .map(([key]) => key);
}

export function legalDataComplete(): boolean {
  return pendingLegalFields().length === 0;
}

/**
 * Seller data needed for the free promotional download ("Tu primer QR es gratis").
 * No sale and no invoice, so CUIT and IVA condition stay sales-only. Still required:
 * who is responsible and where (Ley 24.240 also covers free relationships; Ley 25.326,
 * because we collect an email) and a monitored contact.
 */
export const PROMO_LEGAL_FIELDS = ["legalName", "address", "supportEmail"] as const;

export function legalFieldsComplete(
  record: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  return fields.every((field) => {
    const value = record[field];
    return typeof value === "string" && value.trim().length > 0 && !isPending(value);
  });
}

export function promoLegalDataComplete(): boolean {
  return legalFieldsComplete(legal, PROMO_LEGAL_FIELDS);
}

/** Support mailbox, or null while it is still a placeholder. */
export function supportMailbox(): string | null {
  const value = legal.supportEmail.trim();
  if (isPending(value)) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}
