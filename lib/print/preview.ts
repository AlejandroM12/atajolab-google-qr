import type { ProductArtwork } from "@/lib/artwork";
import { layoutArtwork } from "@/lib/print/layout";
import { renderSvg } from "@/lib/print/render";

export function renderArtworkSvg(artwork: ProductArtwork): string {
  return renderSvg(layoutArtwork(artwork), "mm");
}
