import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";

const steps = [
  {
    title: "Elegí el objetivo",
    detail:
      "Ubicación en Google Maps o enlace para dejar una reseña. Pegá el enlace HTTPS oficial: el editor no mezcla los dos destinos.",
  },
  {
    title: "Elegí la plantilla",
    detail:
      "Minimal Elegance, Dark Premium o Brand Identity. Escribí el título, el subtítulo y, si querés, sumá el logo.",
  },
  {
    title: "Revisá la pieza completa",
    detail:
      "La vista previa muestra la tarjeta o el cartel, no solo el QR. Escaneá el código para confirmar el enlace.",
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
