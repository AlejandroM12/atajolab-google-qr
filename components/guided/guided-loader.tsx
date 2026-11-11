"use client";

import dynamic from "next/dynamic";

/** The flow restores its state from sessionStorage, so it renders in the browser only. */
const GuidedFlow = dynamic(() => import("@/components/guided/guided-flow").then((mod) => mod.GuidedFlow), {
  ssr: false,
  loading: () => (
    <p className="px-4 py-16 text-center text-sm text-muted" role="status">
      Cargando…
    </p>
  ),
});

export function GuidedLoader({ priceNote }: { priceNote: string | null }) {
  return <GuidedFlow priceNote={priceNote} />;
}
