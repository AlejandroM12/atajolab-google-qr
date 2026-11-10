"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { studioBootKey } from "@/lib/studio/bootstrap";
import type { InspirationId } from "@/lib/studio/inspiration";

const StudioEditor = dynamic(
  () => import("@/components/studio/studio-editor").then((mod) => mod.StudioEditor),
  {
    ssr: false,
    loading: () => (
      <p className="px-4 py-16 text-center text-sm text-muted" role="status">
        Cargando el editor…
      </p>
    ),
  },
);

export function StudioLoader({
  exportEnabled = true,
  checkoutEnabled = false,
  freeFirstEnabled = false,
  inspirationPreviews,
}: {
  exportEnabled?: boolean;
  checkoutEnabled?: boolean;
  freeFirstEnabled?: boolean;
  inspirationPreviews: Record<InspirationId, string>;
}) {
  const searchParams = useSearchParams();
  const bootKey = studioBootKey(searchParams.toString());

  return (
    <StudioEditor
      key={bootKey}
      exportEnabled={exportEnabled}
      checkoutEnabled={checkoutEnabled}
      freeFirstEnabled={freeFirstEnabled}
      inspirationPreviews={inspirationPreviews}
    />
  );
}
