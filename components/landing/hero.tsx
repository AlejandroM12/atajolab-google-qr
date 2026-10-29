import { ButtonLink } from "@/components/button-link";
import { Container } from "@/components/container";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,110,98,0.16),transparent_42%)]"
      />
      <Container className="relative grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(17rem,0.85fr)] lg:py-24">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Para comercios y profesionales
          </p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.05] text-foreground sm:text-6xl">
            Un cartel o un sticker para pedir reseñas en Google
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Armá un QR que abre el formulario de reseña. También podés usarlo para la ubicación.
            La vista previa es la pieza que después se descarga para imprimir.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/crear">Diseñar la pieza</ButtonLink>
            <ButtonLink href="/#como-funciona" variant="secondary">
              Cómo funciona
            </ButtonLink>
          </div>
        </div>
        <aside className="rounded-3xl border border-line bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Qué podés diseñar hoy</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed">
            <li className="rounded-2xl bg-ok-bg px-4 py-3">
              <span className="block font-semibold text-accent-strong">Reseña</span>
              <span className="mt-1 block text-foreground/80">
                Un cartel o un sticker cuyo QR abre el formulario para dejar una opinión.
              </span>
            </li>
            <li className="rounded-2xl bg-background px-4 py-3">
              <span className="block font-semibold">Ubicación</span>
              <span className="mt-1 block text-muted">
                El mismo tipo de pieza, si el enlace es el de Google Maps.
              </span>
            </li>
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            La vista previa es el archivo que se imprime. No incluye un chip. Antes de pagar te pedimos un correo,
            sin crear una cuenta. El pago queda en Mercado Pago. Si se confirma, descargás PNG, SVG y PDF.
          </p>
        </aside>
      </Container>
    </section>
  );
}
