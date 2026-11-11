/**
 * Encryption at rest for the QR content of Studio orders.
 *
 * An order has to keep what its code carries: the files are drawn again on
 * every download. For a link that is public by nature. For Wi-Fi it includes
 * the network password, and for a contact, personal data. Those are stored
 * encrypted (AES-256-GCM, key derived from ORDER_ACCESS_SECRET), so a database
 * dump or backup alone does not reveal them. The app decrypts them only to
 * render the order.
 *
 * Trade-off: if ORDER_ACCESS_SECRET is rotated, sealed orders can no longer be
 * rendered. Links stay in clear text and are not affected.
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync } from "node:crypto";

const PREFIX = "sealed:v1:";

function keys(secret: string): { cipher: Buffer; nonce: Buffer } {
  const derive = (info: string) => Buffer.from(hkdfSync("sha256", secret, "atajolab-qr", info, 32));
  return { cipher: derive("studio-artwork-seal"), nonce: derive("studio-artwork-nonce") };
}

/** Links are meant to be public; everything else (Wi-Fi, contacts, free text) is sealed. */
export function needsSeal(value: string): boolean {
  return !/^https?:\/\//i.test(value.trim()) && !isSealed(value);
}

export function isSealed(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function sealText(value: string, secret: string): string {
  const { cipher: key, nonce } = keys(secret);
  // Derived from the text, so sealing the same order twice gives the same stored value.
  const iv = createHmac("sha256", nonce).update(value).digest().subarray(0, 12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** Null when the value was not sealed with this secret or was altered. */
export function openText(sealed: string, secret: string): string | null {
  if (!isSealed(sealed)) return null;
  try {
    const raw = Buffer.from(sealed.slice(PREFIX.length), "base64url");
    if (raw.length < 28) return null;
    const decipher = createDecipheriv("aes-256-gcm", keys(secret).cipher, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

type ArtworkJson = Record<string, unknown>;

function mapQrContent(artwork: unknown, change: (value: string) => string | null): unknown {
  if (typeof artwork !== "object" || artwork === null || Array.isArray(artwork)) return artwork;
  const record = artwork as ArtworkJson;
  if (typeof record.href !== "string") return artwork;
  const href = change(record.href);
  if (href === null) return artwork;

  const document = record.document;
  if (typeof document !== "object" || document === null) return { ...record, href };
  const elements = (document as ArtworkJson).elements;
  if (!Array.isArray(elements)) return { ...record, href };
  return {
    ...record,
    href,
    document: {
      ...(document as ArtworkJson),
      elements: elements.map((element: unknown) => {
        if (typeof element !== "object" || element === null) return element;
        const item = element as ArtworkJson;
        if (item.type !== "qr" || typeof item.value !== "string") return element;
        const value = change(item.value);
        return value === null ? element : { ...item, value };
      }),
    },
  };
}

/** What goes into Order.artwork: the same snapshot with non-link QR content encrypted. */
export function sealStudioArtwork<T>(artwork: T, secret: string): T {
  return mapQrContent(artwork, (value) => (needsSeal(value) ? sealText(value, secret) : null)) as T;
}

/**
 * What comes out of Order.artwork, ready for readArtworkSnapshot. Clear-text orders
 * pass through. Null when the content is sealed and cannot be opened (missing or
 * rotated secret): such an order must not be drawn with the ciphertext as its code.
 */
export function openStudioArtwork(stored: unknown, secret: string | null): unknown {
  const opened = secret
    ? mapQrContent(stored, (value) => (isSealed(value) ? openText(value, secret) : null))
    : stored;
  if (typeof opened === "object" && opened !== null && !Array.isArray(opened)) {
    const href = (opened as ArtworkJson).href;
    if (typeof href === "string" && isSealed(href)) return null;
  }
  return opened;
}
