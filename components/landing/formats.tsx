import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { availableNow, upcoming } from "@/lib/product";

export function Formats() {
  return (
    <section id="formatos" className="scroll-mt-24 border-t border-line py-16 sm:py-20">
      <Container>
        <SectionHeading eyebrow="Formatos" title="Digital ahora. Kits físicos más adelante.">
          Hoy podés diseñar tres plantillas, dejar un pedido y, si el pago queda confirmado, descargar
          la pieza. Los kits con NFC todavía no están disponibles.
        </SectionHeading>
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-accent/30 bg-ok-bg p-6 sm:p-8">
            <h3 className="text-xl font-semibold text-accent-strong">Disponible en esta versión</h3>
            <ul className="mt-5 space-y-3 text-sm leading-relaxed">
              {availableNow.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
          <article className="rounded-3xl border border-dashed border-line bg-card p-6 sm:p-8">
            <h3 className="text-xl font-semibold">Próximamente</h3>
            <p className="mt-2 text-sm text-muted">Todavía no forman parte de esta versión.</p>
            <ul className="mt-5 space-y-4">
              {upcoming.map((item) => (
                <li key={item.title}>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{item.detail}</p>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </Container>
    </section>
  );
}
