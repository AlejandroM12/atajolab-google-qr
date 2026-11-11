import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";

const steps = [
  {
    title: "Contanos qué compartir",
    detail: "Un enlace, tus redes, WhatsApp, Wi-Fi, un contacto o un texto. Cargás los datos y armamos el código.",
  },
  {
    title: "Elegí y personalizá",
    detail: "Mirá propuestas con tu código, elegí una y cambiá textos, colores e imágenes en el editor.",
  },
  {
    title: "Descargá",
    detail: "Bajá PNG, SVG y PDF en tamaño real, listos para imprimir o publicar.",
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
