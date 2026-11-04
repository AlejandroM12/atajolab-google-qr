import { prisma } from "@/lib/db";
import {
  createPrismaStudioAssetStore,
  hydrateStudioDocument,
  type StudioAssetStore,
} from "@/lib/studio/assets/index";
import {
  readStudioCommercialArtwork,
  type StudioCommercialArtworkV8,
} from "@/lib/studio/commercial-artwork";
import { compileStudioScene, renderStudioSvg } from "@/lib/studio/export/index";
import { validateForExport } from "@/lib/studio/export/validate";

/**
 * Server-side summary preview for a frozen Studio v8 order.
 * Hydrates private assets in order scope; never accepts a client design payload.
 */
export async function renderStudioOrderPreviewSvg(input: {
  orderId: string;
  artwork: StudioCommercialArtworkV8;
  store?: StudioAssetStore;
}): Promise<string | null> {
  const snapshot = readStudioCommercialArtwork(input.artwork);
  if (!snapshot) return null;

  const store = input.store ?? createPrismaStudioAssetStore(prisma);
  const hydrated = await hydrateStudioDocument({
    document: snapshot.document,
    store,
    scope: { kind: "order", orderId: input.orderId },
  });
  if (!hydrated.ok) return null;

  const validation = validateForExport(hydrated.document);
  if (!validation.ready) return null;

  try {
    const scene = compileStudioScene(hydrated.document);
    return renderStudioSvg(scene, "mm");
  } catch {
    return null;
  }
}
