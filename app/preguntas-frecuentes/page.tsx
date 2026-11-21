import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/container";
import { SalesAware } from "@/components/sales-aware";
import { getFaqItems } from "@/lib/faq";
import { jsonLd } from "@/lib/site";

export const metadata: Metadata = {
  title: "Preguntas frecuentes",
  description: "Cómo funciona AtajoLab QR: qué puede abrir el código, formatos, pago, descarga e impresión.",
  alternates: { canonical: "/preguntas-frecuentes" },
};

export default function FaqPage() {
  return (
    <main>
      <Container className="py-10 sm:py-14">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Ayuda</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight">Preguntas frecuentes</h1>
          <SalesAware fallback={<FaqContent salesOpen={false} />}>{(salesOpen) => <FaqContent salesOpen={salesOpen} />}</SalesAware>
          <p className="mt-8 text-sm text-muted">
            ¿Tenés otra duda?{" "}
            <Link href="/contacto" className="underline">
              Escribinos
            </Link>
            .
          </p>
        </div>
      </Container>
    </main>
  );
}

/** The questions and their structured data, with the price answers that match the sales state. */
function FaqContent({ salesOpen }: { salesOpen: boolean }) {
  const items = getFaqItems(salesOpen);
  const structured = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
  return (
    <>
      <div className="mt-8 divide-y divide-line rounded-3xl border border-line bg-card">
        {items.map((item) => (
          <details key={item.question} className="group px-5 py-4">
            <summary className="cursor-pointer list-none text-base font-semibold leading-snug marker:hidden">
              {item.question}
            </summary>
            <p className="mt-3 text-sm leading-6 text-muted">{item.answer}</p>
          </details>
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
    </>
  );
}
