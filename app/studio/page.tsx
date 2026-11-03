import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { StudioLoader } from "@/components/studio/studio-loader";
import { studioExportAllowed } from "@/lib/studio/export/access";

export const metadata: Metadata = {
  title: "Studio",
  description: "Editor de prueba para carteles A6. No genera pedidos.",
  robots: { index: false, follow: false },
};

export default function StudioPage() {
  return (
    <main className="bg-background">
      <Suspense
        fallback={
          <p className="px-4 py-16 text-center text-sm text-muted" role="status">
            Cargando el estudio…
          </p>
        }
      >
        <StudioGate />
      </Suspense>
    </main>
  );
}

async function StudioGate() {
  await connection();
  return <StudioLoader exportEnabled={studioExportAllowed()} />;
}
