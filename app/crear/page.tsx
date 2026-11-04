import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { StudioLoader } from "@/components/studio/studio-loader";
import { studioCheckoutAllowed } from "@/lib/studio/checkout-access";
import { studioExportAllowed } from "@/lib/studio/export/access";

export const metadata: Metadata = {
  title: "Crear mi cartel QR",
  description:
    "Diseñá tu cartel A6 con código QR, personalizalo a tu gusto y descargalo listo para imprimir.",
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
  await connection();
  return (
    <StudioLoader
      exportEnabled={studioExportAllowed()}
      checkoutEnabled={studioCheckoutAllowed()}
    />
  );
}
