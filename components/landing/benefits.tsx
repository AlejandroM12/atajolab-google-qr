import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";

const benefits = [
  {
    title: "Objetivo separado",
    detail:
      "El QR de la ubicación y el QR de la reseña se arman con reglas distintas. Un link del mapa no se presenta como formulario de reseña.",
  },
  {
    title: "Enlace controlado",
    detail:
      "Tiene que ser HTTPS y pertenecer a un dominio de Google admitido. Rechazamos HTTP, otros sitios y direcciones armadas para parecer Google.",
  },
  {
    title: "Pieza completa",
    detail:
      "La vista previa es la tarjeta o el cartel, con el texto y un QR real. Podés leerlo con la cámara del celular.",
  },
  {
    title: "Diseño con contraste",
    detail:
      "Cambiás colores, tipografía y tamaño del QR. Si el texto o el código no se distinguen, el pedido no avanza.",
  },
  {
    title: "Logo opcional",
    detail:
      "Podés subir un PNG, JPG o WebP. Se recorta en cuadrado, se guarda como PNG y se vuelve a validar en el servidor.",
  },
];

export function Benefits() {
  return (
    <section id="beneficios" className="scroll-mt-24 bg-card py-16 sm:py-20">
      <Container>
        <SectionHeading eyebrow="Criterio" title="Hecho para usar un enlace de verdad">
          El editor comprueba el destino antes de dibujar la pieza. No completa datos de tu comercio
          ni consulta la API de Google.
        </SectionHeading>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit) => (
            <li key={benefit.title} className="rounded-3xl border border-line bg-background p-6">
              <h3 className="text-lg font-semibold">{benefit.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{benefit.detail}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
