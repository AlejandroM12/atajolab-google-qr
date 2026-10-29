import type { Metadata } from "next";
import { Container } from "@/components/container";
import { QrStudio } from "@/components/qr-studio";

export const metadata: Metadata = {
  title: "Crear mi cartel QR",
  description:
    "Personalizá tu cartel o sticker QR en minutos y descargalo listo para imprimir.",
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
