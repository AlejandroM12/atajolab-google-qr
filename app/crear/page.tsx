import type { Metadata } from "next";
import { Container } from "@/components/container";
import { QrStudio } from "@/components/qr-studio";

export const metadata: Metadata = {
  title: "Diseñar la pieza",
  description:
    "Elegí una plantilla, personalizá la tarjeta o el cartel y mirá la pieza completa antes de pedirla.",
};

export default function CreateQrPage() {
  return (
    <main>
      <Container className="py-8 sm:py-10">
        <QrStudio />
      </Container>
    </main>
  );
}
