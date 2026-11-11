import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { StudioLoader } from "@/components/studio/studio-loader";
import { inspirationPreviewUrls } from "@/lib/studio/inspiration-preview-url";
import { studioSalesOpen } from "@/lib/studio/checkout-access";
import { freeFirstQrOpen } from "@/lib/free-first-qr";
import { studioExportAllowed } from "@/lib/studio/export/access";

export const metadata: Metadata = {
  title: "Editor de diseños QR",
  description:
    "Diseñá tu pieza con código QR sobre un lienzo libre, personalizala a tu gusto y descargala lista para imprimir o publicar.",
  alternates: { canonical: "/crear" },
};

export default function CreateQrPage() {
  return (
    <main className="bg-background">
      <Suspense
        fallback={
          <p className="px-4 py-16 text-center text-sm text-muted" role="status">
            Cargando el editor…
          </p>
        }
      >
        <StudioGate />
      </Suspense>
    </main>
  );
}

async function StudioGate() {
  // Flags are read per request (env can change without a rebuild).
  await connection();
  const inspirationPreviews = inspirationPreviewUrls();

  return (
    <StudioLoader
      exportEnabled={studioExportAllowed()}
      checkoutEnabled={studioSalesOpen()}
      freeFirstEnabled={freeFirstQrOpen()}
      inspirationPreviews={inspirationPreviews}
    />
  );
}
