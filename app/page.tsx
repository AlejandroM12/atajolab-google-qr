import type { Metadata } from "next";
import { Benefits } from "@/components/landing/benefits";
import { Formats } from "@/components/landing/formats";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";

export const metadata: Metadata = {
  description:
    "Editor de AtajoLab para diseñar una tarjeta o un cartel con un QR de Google Maps o de reseñas. Mirá la pieza completa antes de pedirla.",
};

export default function HomePage() {
  return (
    <main>
      <Hero />
      <HowItWorks />
      <Benefits />
      <Formats />
    </main>
  );
}
