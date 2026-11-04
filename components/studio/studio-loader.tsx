"use client";

import dynamic from "next/dynamic";

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
}: {
  exportEnabled?: boolean;
  checkoutEnabled?: boolean;
}) {
  return <StudioEditor exportEnabled={exportEnabled} checkoutEnabled={checkoutEnabled} />;
}
