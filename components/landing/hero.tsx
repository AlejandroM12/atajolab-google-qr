import { ButtonLink } from "@/components/button-link";
import { Container } from "@/components/container";
import { DEMO_BUSINESS_NAME, designSampleSvg } from "@/components/landing/samples";

export function Hero() {
  const sample = designSampleSvg("stand-classic");

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
            Hacé que dejar una reseña sea más fácil
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Creá un cartel o sticker con un código QR que lleva a tus clientes a dejar una reseña en Google.
            Personalizalo y descargalo listo para imprimir.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/crear">Crear mi cartel QR</ButtonLink>
            <ButtonLink href="/#como-funciona" variant="secondary">
              Cómo funciona
            </ButtonLink>
          </div>
          <p className="mt-5 text-sm font-semibold text-foreground/80">
            Sin registrarte · Pago con Mercado Pago · Descarga digital
          </p>
        </div>
        <figure className="mx-auto w-full max-w-sm">
          <div
            className="[&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
            role="img"
            aria-label={`Ejemplo del diseño Clásico para ${DEMO_BUSINESS_NAME}`}
            dangerouslySetInnerHTML={{ __html: sample }}
          />
          <figcaption className="mt-3 text-center text-sm text-muted">
            Ejemplo de muestra · {DEMO_BUSINESS_NAME}
          </figcaption>
        </figure>
      </Container>
    </section>
  );
}
