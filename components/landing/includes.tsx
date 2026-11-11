import { ButtonLink } from "@/components/button-link";
import { Container } from "@/components/container";
import { FreeFirstNote } from "@/components/landing/free-first-note";
import { SectionHeading } from "@/components/section-heading";
import { formatArs, PIECE_PRICE_ARS } from "@/lib/pricing";

const items = [
  "Creación guiada y editor visual libre.",
  "Enlaces, redes, WhatsApp, Wi-Fi, contactos y texto.",
  "Siete formatos para imprimir o publicar.",
  "Código QR legible, sin vencimiento.",
  "Archivos PNG, SVG y PDF.",
  "Sin necesidad de crear una cuenta.",
];

export function Includes() {
  return (
    <section className="border-t border-line py-16 sm:py-20">
      <Container className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <SectionHeading eyebrow="Compra" title="Tu diseño, listo para imprimir">
            Un pago y descargás el diseño para usarlo donde quieras.
          </SectionHeading>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-relaxed">
                <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <aside className="rounded-3xl border border-accent/30 bg-ok-bg p-6 sm:p-8">
          <FreeFirstNote variant="price" />
          <p className="text-sm font-semibold text-accent-strong">Pago único, sin suscripciones.</p>
          <p className="mt-3 text-4xl font-semibold">{formatArs(PIECE_PRICE_ARS)}</p>
          <p className="mt-1 text-sm text-muted">ARS</p>
          <div className="mt-6">
            <ButtonLink href="/empezar">Crear mi QR</ButtonLink>
          </div>
        </aside>
      </Container>
    </section>
  );
}
