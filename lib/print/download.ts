import { isPremiumTemplate, templateSpec, type ArtworkExportFormat, type ProductArtwork } from "@/lib/artwork";
import { DIGITAL_DOWNLOADS_ENABLED, type OrderStatus } from "@/lib/delivery";
import { digitalDeliveryAllowed } from "@/lib/payments/access";
import { isPublicId } from "@/lib/public-id";
import { isArtworkFormat, renderArtworkFile } from "@/lib/print/render";

export type DownloadOrder = {
  publicId: string;
  status: OrderStatus;
  artwork: ProductArtwork;
  deliveryKeyHash: string | null;
  accessKeyHashes?: string[];
};

export type DownloadDecision =
  | { ok: true; format: ArtworkExportFormat; artwork: ProductArtwork }
  | { ok: false; status: 403 | 404; error: "not-found" | "download-unavailable" };

export function artworkFilename(
  templateId: ProductArtwork["templateId"],
  businessName: string,
  format: ArtworkExportFormat,
): string {
  const slug = businessName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const template = isPremiumTemplate(templateId) ? templateId : templateSpec(templateId).id;
  const base = slug.length > 0 ? `${template}-${slug}` : template;
  return `${base}.${format}`;
}

export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function resolveArtworkDownload(input: {
  publicId: string;
  format: string;
  deliveryKey: string | null;
  order: DownloadOrder | null;
}): DownloadDecision {
  if (!isPublicId(input.publicId) || !isArtworkFormat(input.format)) {
    return { ok: false, status: 404, error: "not-found" };
  }
  if (!input.order || input.order.publicId !== input.publicId || !input.order.artwork.href) {
    return { ok: false, status: 404, error: "not-found" };
  }
  if (
    !digitalDeliveryAllowed({
      downloadsEnabled: DIGITAL_DOWNLOADS_ENABLED,
      status: input.order.status,
      key: input.deliveryKey,
      storedHash: input.order.deliveryKeyHash,
      extraHashes: input.order.accessKeyHashes,
    })
  ) {
    return { ok: false, status: 403, error: "download-unavailable" };
  }

  return { ok: true, format: input.format, artwork: input.order.artwork };
}

export async function artworkAttachment(artwork: ProductArtwork, format: ArtworkExportFormat): Promise<{
  body: Buffer;
  headers: Record<string, string>;
}> {
  const file = await renderArtworkFile(artwork, format);
  return {
    body: file.body,
    headers: {
      "content-type": file.mime,
      "content-disposition": contentDisposition(artworkFilename(artwork.templateId, artwork.businessName, format)),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  };
}
