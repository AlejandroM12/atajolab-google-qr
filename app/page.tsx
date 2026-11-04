import type { Metadata } from "next";
import { Designs } from "@/components/landing/designs";
import { Formats } from "@/components/landing/formats";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Includes } from "@/components/landing/includes";
import { Inspiration } from "@/components/landing/inspiration";
import { SITE_DESCRIPTION, SITE_NAME, homeStructuredData, jsonLd, siteUrl } from "@/lib/site";

const TITLE = "Cartel QR para reseñas de Google";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: SITE_DESCRIPTION,
    locale: "es_AR",
    type: "website",
    url: "/",
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(homeStructuredData(siteUrl())) }} />
    </main>
  );
}
