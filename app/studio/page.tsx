import type { Metadata } from "next";
import { StudioLoader } from "@/components/studio/studio-loader";

export const metadata: Metadata = {
  title: "Studio",
  description: "Editor de prueba para carteles A6. No genera pedidos.",
  robots: { index: false, follow: false },
};

export default function StudioPage() {
  return (
    <main className="bg-background">
      <StudioLoader />
    </main>
  );
}
