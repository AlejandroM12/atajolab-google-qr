import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { StudioLoader } from "@/components/studio/studio-loader";
import { studioCheckoutAllowed } from "@/lib/studio/checkout-access";
import { studioExportAllowed } from "@/lib/studio/export/access";

export const metadata: Metadata = {
  title: "Studio",
  description: "Editor de carteles A6. El cobro comercial depende de la configuración del servidor.",
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
  return (
    <StudioLoader
      exportEnabled={studioExportAllowed()}
      checkoutEnabled={studioCheckoutAllowed()}
    />
  );
}
