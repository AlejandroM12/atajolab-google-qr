import type { Metadata } from "next";
import { Designs } from "@/components/landing/designs";
import { Formats } from "@/components/landing/formats";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Includes } from "@/components/landing/includes";
import { Inspiration } from "@/components/landing/inspiration";

export const metadata: Metadata = {
  title: "Carteles y stickers QR para tu negocio",
  description:
    "Creá un cartel o sticker con un código QR para que tus clientes dejen una reseña en Google. Personalizalo y descargalo listo para imprimir.",
  openGraph: {
    title: "Carteles y stickers QR para tu negocio",
    description:
      "Creá un cartel o sticker con un código QR para que tus clientes dejen una reseña en Google. Personalizalo y descargalo listo para imprimir.",
    locale: "es_AR",
    type: "website",
  },
};

export default function HomePage() {
  return (
    <main>
      <Hero />
      <HowItWorks />
      <Designs />
      <Inspiration />
      <Formats />
      <Includes />
    </main>
  );
}
