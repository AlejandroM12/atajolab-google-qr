import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";

const steps = [
  {
    title: "Creá",
    detail: "Elegí una plantilla de ejemplo o empezá desde cero en el lienzo.",
  },
  {
    title: "Personalizá",
    detail: "Editá textos, colores, tipografías e imágenes directamente sobre el cartel.",
  },
  {
    title: "Pagá y descargá",
    detail: "Confirmá el pago y bajá PNG, SVG y PDF listos para imprimir.",
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-24 border-t border-line py-16 sm:py-20">
      <Container>
        <SectionHeading eyebrow="Uso" title="Cómo funciona">
          Tres pasos, sin crear una cuenta.
        </SectionHeading>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-3xl border border-line bg-card p-6">
              <span className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
                {index + 1}
              </span>
              <h3 className="mt-4 text-xl font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.detail}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
