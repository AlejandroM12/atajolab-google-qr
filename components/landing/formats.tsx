import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";

const formats = [
  {
    name: "Cartel A6",
    detail: "Perfecto para mostradores, recepciones y espacios de atención.",
    size: "Tamaño: 105 × 148 mm.",
  },
  {
    name: "Sticker QR",
    detail: "Ideal para vidrieras, mostradores y otras superficies.",
    size: "Tamaño: 80 × 80 mm.",
  },
];

export function Formats() {
  return (
    <section id="formatos" className="scroll-mt-24 border-t border-line py-16 sm:py-20">
      <Container>
        <SectionHeading eyebrow="Formatos" title="Elegí el formato ideal para tu negocio">
          Recibís archivos digitales para imprimir donde quieras. No enviamos un producto físico a domicilio.
        </SectionHeading>
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {formats.map((format) => (
            <article key={format.name} className="rounded-3xl border border-line bg-card p-6 sm:p-8">
              <h3 className="text-xl font-semibold">{format.name}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{format.detail}</p>
              <p className="mt-3 text-sm font-semibold">{format.size}</p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
