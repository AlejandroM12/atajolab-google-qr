import type { Metadata } from "next";
import { Container } from "@/components/container";
import { QrStudio } from "@/components/qr-studio";

export const metadata: Metadata = {
  title: "Diseñar la pieza",
  description:
    "Armá un cartel o un sticker con el QR de reseñas y mirá la pieza completa antes de pedirla.",
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
