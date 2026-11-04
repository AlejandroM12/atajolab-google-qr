import { isPremiumTemplate, templateSpec, type ArtworkExportFormat, type ProductArtwork } from "@/lib/artwork";
import { DIGITAL_DOWNLOADS_ENABLED, type OrderStatus } from "@/lib/delivery";
import type { OrderArtwork } from "@/lib/order-draft";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/log";
import { digitalDeliveryAllowed } from "@/lib/payments/access";
import { isPublicId } from "@/lib/public-id";
import { isArtworkFormat, renderArtworkFile } from "@/lib/print/render";
import {
  createPrismaStudioAssetStore,
  hydrateStudioDocument,
  type StudioAssetStore,
} from "@/lib/studio/assets/index";
import {
  readStudioCommercialArtwork,
  STUDIO_COMMERCIAL_ARTWORK_VERSION,
  type StudioCommercialArtworkV8,
} from "@/lib/studio/commercial-artwork";
import {
  exportStudioDesign,
  studioContentDisposition,
} from "@/lib/studio/export/index";

export type DownloadOrder = {
  publicId: string;
  status: OrderStatus;
  artwork: OrderArtwork;
  deliveryKeyHash: string | null;
  accessKeyHashes?: string[];
};

export type DownloadDecision =
  | { ok: true; format: ArtworkExportFormat; artwork: OrderArtwork }
  | { ok: false; status: 403 | 404; error: "not-found" | "download-unavailable" };

export type OrderDownloadAttachment =
  | {
      ok: true;
      body: Buffer;
      headers: Record<string, string>;
    }
  | {
      ok: false;
      status: 403 | 404 | 422 | 500;
      error: "download-unavailable" | "not-found" | "invalid-snapshot" | "asset-unavailable" | "export-failed";
    };

export function artworkFilename(
  templateId: ProductArtwork["templateId"],
  businessName: string,
  format: ArtworkExportFormat,
): string {
  const slug = filenameSlug(businessName);
  const template = isPremiumTemplate(templateId) ? templateId : templateSpec(templateId).id;
  const base = slug.length > 0 ? `${template}-${slug}` : template;
  return `${base}.${format}`;
}

export function studioCommercialFilename(
  artwork: StudioCommercialArtworkV8,
  format: ArtworkExportFormat,
): string {
  const slug = filenameSlug(artwork.title);
  const base = slug.length > 0 ? `studio-${artwork.templateId}-${slug}` : `studio-${artwork.templateId}`;
  return `${base}.${format}`;
}

export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Authorize a commercial download. Must run before hydrating assets or rendering.
 * Does not accept a client design payload — only the stored Order snapshot.
 */
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

/**
 * Render a paid Studio v8 snapshot. Authorization must already have passed via resolveArtworkDownload.
 * Never uses STUDIO_EXPORT_ENABLED — paid commercial delivery is independent of the public preview flag.
 */
export async function studioCommercialAttachment(input: {
  artwork: StudioCommercialArtworkV8;
  format: ArtworkExportFormat;
  orderId: string;
  store?: StudioAssetStore;
}): Promise<OrderDownloadAttachment> {
  const snapshot = readStudioCommercialArtwork(input.artwork);
  if (!snapshot) {
    return { ok: false, status: 422, error: "invalid-snapshot" };
  }

  const store = input.store ?? createPrismaStudioAssetStore(prisma);
  const hydrated = await hydrateStudioDocument({
    document: snapshot.document,
    store,
    scope: { kind: "order", orderId: input.orderId },
  });
  if (!hydrated.ok) {
    return { ok: false, status: 422, error: "asset-unavailable" };
  }

  const exported = await exportStudioDesign(hydrated.document, input.format);
  if (!exported.ok) {
    return {
      ok: false,
      status: exported.error === "not-ready" ? 422 : 500,
      error: exported.error === "not-ready" ? "invalid-snapshot" : "export-failed",
    };
  }

  const filename = studioCommercialFilename(snapshot, input.format);
  return {
    ok: true,
    body: exported.body,
    headers: {
      "content-type": exported.mime,
      "content-disposition": studioContentDisposition(filename),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  };
}

/** Route helper: authorize then render legacy or Studio v8 without accepting a client design. */
export async function buildOrderDownloadAttachment(input: {
  publicId: string;
  format: string;
  deliveryKey: string | null;
  order: DownloadOrder | null;
  store?: StudioAssetStore;
}): Promise<OrderDownloadAttachment> {
  const decision = resolveArtworkDownload({
    publicId: input.publicId,
    format: input.format,
    deliveryKey: input.deliveryKey,
    order: input.order,
  });
  if (!decision.ok) {
    return { ok: false, status: decision.status, error: decision.error };
  }

  try {
    if (decision.artwork.version === STUDIO_COMMERCIAL_ARTWORK_VERSION) {
      // await keeps async failures (DB, hydration) inside this try/catch.
      return await studioCommercialAttachment({
        artwork: decision.artwork,
        format: decision.format,
        orderId: input.publicId,
        store: input.store,
      });
    }

    const file = await artworkAttachment(decision.artwork, decision.format);
    return { ok: true, body: file.body, headers: file.headers };
  } catch (error) {
    logError("download.export-failed", error, { publicId: input.publicId, format: decision.format });
    return { ok: false, status: 500, error: "export-failed" };
  }
}

function filenameSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
