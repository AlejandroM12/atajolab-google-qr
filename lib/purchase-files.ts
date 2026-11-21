import type { ArtworkExportFormat } from "@/lib/artwork";
import { MAIL_ATTACHMENT_BUDGET_BYTES } from "@/lib/mail-resend";
import type { MailAttachment } from "@/lib/mail";
import { readArtworkSnapshot, type OrderArtwork } from "@/lib/order-draft";
import { prisma } from "@/lib/db";
import {
  artworkAttachment,
  artworkFilename,
  studioCommercialAttachment,
  studioCommercialFilename,
} from "@/lib/print/download";
import { openStudioArtwork } from "@/lib/studio/artwork-seal";
import { STUDIO_COMMERCIAL_ARTWORK_VERSION } from "@/lib/studio/commercial-artwork";
import { orderAccessSecret } from "@/lib/studio/order-idempotency";

/** Same three files, in the same order, that the order page offers. */
export const PURCHASE_FORMATS: ArtworkExportFormat[] = ["png", "pdf", "svg"];

export type PurchaseFile = MailAttachment & { format: ArtworkExportFormat };

/** The stored snapshot of a paid order, opened (decrypted) for rendering. Null when it cannot be read. */
export async function loadPurchaseArtwork(orderId: string): Promise<OrderArtwork | null> {
  const row = await prisma.order.findUnique({ where: { id: orderId }, select: { artwork: true } });
  if (!row) return null;
  return readArtworkSnapshot(openStudioArtwork(row.artwork, orderAccessSecret()));
}

/**
 * Renders the exact design that was bought with the existing exporters (the ones the download route uses),
 * under the same file names. Throws when any file cannot be produced, so the caller can retry.
 * Authorization is the caller's job: only a PAID order may reach this.
 */
export async function renderPurchaseFiles(artwork: OrderArtwork, orderId: string): Promise<PurchaseFile[]> {
  const files: PurchaseFile[] = [];
  for (const format of PURCHASE_FORMATS) {
    if (artwork.version === STUDIO_COMMERCIAL_ARTWORK_VERSION) {
      const rendered = await studioCommercialAttachment({ artwork, format, orderId });
      if (!rendered.ok) throw new Error(`purchase-file-${format}-${rendered.error}`);
      files.push({
        format,
        filename: studioCommercialFilename(artwork, format),
        content: rendered.body,
        contentType: contentTypeOf(rendered.headers["content-type"], format),
      });
    } else {
      const rendered = await artworkAttachment(artwork, format);
      files.push({
        format,
        filename: artworkFilename(artwork.templateId, artwork.businessName, format),
        content: rendered.body,
        contentType: contentTypeOf(rendered.headers["content-type"], format),
      });
    }
  }
  return files;
}

/** Whether the three files fit in one message; if not, the mail goes out with the download button only. */
export function fitsInMail(files: { content: Buffer }[]): boolean {
  return files.reduce((sum, file) => sum + file.content.length, 0) <= MAIL_ATTACHMENT_BUDGET_BYTES;
}

function contentTypeOf(header: string | undefined, format: ArtworkExportFormat): string {
  if (header) return header.split(";")[0]!.trim();
  return format === "png" ? "image/png" : format === "svg" ? "image/svg+xml" : "application/pdf";
}
