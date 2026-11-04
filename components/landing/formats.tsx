import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";

export function Formats() {
  return (
    <section id="formatos" className="scroll-mt-24 border-t border-line py-16 sm:py-20">
      <Container>
        <SectionHeading eyebrow="Formato" title="Cartel A6 listo para imprimir">
          Recibís archivos digitales. No enviamos un producto físico a domicilio.
        </SectionHeading>
        <article className="mt-10 max-w-xl rounded-3xl border border-line bg-card p-6 sm:p-8">
          <h3 className="text-xl font-semibold">Cartel A6</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Ideal para mostradores, recepciones y espacios de atención. El QR queda grande y legible.
          </p>
          <p className="mt-3 text-sm font-semibold">Tamaño: 105 × 148 mm.</p>
        </article>
      </Container>
    </section>
  );
}
