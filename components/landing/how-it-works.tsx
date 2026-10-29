import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";

const steps = [
  {
    title: "Elegí el objetivo",
    detail:
      "Reseña en Google, o ubicación en el mapa. El objetivo define qué enlace aceptamos. No cambia la plantilla.",
  },
  {
    title: "Elegí el formato y la plantilla",
    detail:
      "Cartel A6 o sticker de 80 × 80 mm. Clásico, Vivo, Nocturno o Mi negocio.",
  },
  {
    title: "Revisá la pieza completa",
    detail:
      "La vista previa es la misma escena que el PNG, el SVG y el PDF. El archivo se imprime: no trae un chip.",
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-24 border-t border-line py-16 sm:py-20">
      <Container>
        <SectionHeading eyebrow="Uso" title="Cómo funciona">
          Tres pasos, en el navegador. No hace falta crear una cuenta. El correo del pedido sirve para recuperar las descargas en otro dispositivo.
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
