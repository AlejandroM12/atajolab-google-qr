import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { GuidedLoader } from "@/components/guided/guided-loader";
import { freeFirstQrOpen } from "@/lib/free-first-qr";

export const metadata: Metadata = {
  title: "Crear mi QR paso a paso",
  description:
    "Elegí qué querés compartir (un enlace, tus redes, WhatsApp, Wi-Fi, un contacto) y recibí diseños listos con tu código QR para personalizar y descargar.",
  alternates: { canonical: "/empezar" },
};

export default function GuidedPage() {
  return (
    <main className="bg-background">
      <Suspense
        fallback={
          <p className="px-4 py-16 text-center text-sm text-muted" role="status">
            Cargando…
          </p>
        }
      >
        <GuidedGate />
      </Suspense>
    </main>
  );
}

async function GuidedGate() {
  // The promotion switch is read per request (env can change without a rebuild).
  await connection();
  return <GuidedLoader priceNote={freeFirstQrOpen() ? "Tu primer QR es gratis." : null} />;
}
