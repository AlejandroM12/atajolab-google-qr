"use client";

import dynamic from "next/dynamic";

const StudioEditor = dynamic(
  () => import("@/components/studio/studio-editor").then((mod) => mod.StudioEditor),
  {
    ssr: false,
    loading: () => (
      <p className="px-4 py-16 text-center text-sm text-muted" role="status">
        Cargando el estudio…
      </p>
    ),
  },
);

export function StudioLoader({ exportEnabled = true }: { exportEnabled?: boolean }) {
  return <StudioEditor exportEnabled={exportEnabled} />;
}
