import { ButtonLink } from "@/components/button-link";
import { Container } from "@/components/container";
import { FreeFirstNote } from "@/components/landing/free-first-note";
import { DEMO_BUSINESS_NAME, SAMPLE_HEIGHT_PX, SAMPLE_WIDTH_PX, sampleImageUrl } from "@/lib/landing-samples";

export function Hero() {
  const sample = sampleImageUrl("stand-classic");

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
            Tu código QR, con un diseño listo para usar
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Compartí tu sitio, tus redes, WhatsApp, el Wi-Fi, tu menú o tus reseñas de Google. Contanos qué
            necesitás, elegí una propuesta y descargala lista para imprimir o publicar.
          </p>
          <FreeFirstNote variant="hero" />
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/empezar">Crear mi QR</ButtonLink>
            <ButtonLink href="/crear" variant="secondary">
              Editor avanzado
            </ButtonLink>
          </div>
          <p className="mt-5 text-sm font-semibold text-foreground/80">
            Sin registrarte · Pago con Mercado Pago · Descarga digital
          </p>
        </div>
        <figure className="mx-auto w-full max-w-sm">
          {/* eslint-disable-next-line @next/next/no-img-element -- prebuilt same-origin WebP (app/previews), already sized */}
          <img
            src={sample}
            width={SAMPLE_WIDTH_PX}
            height={SAMPLE_HEIGHT_PX}
            fetchPriority="high"
            decoding="async"
            alt={`Ejemplo del diseño Clásico para ${DEMO_BUSINESS_NAME}`}
            className="block h-auto w-full"
          />
          <figcaption className="mt-3 text-center text-sm text-muted">
            Ejemplo de muestra · {DEMO_BUSINESS_NAME}
          </figcaption>
        </figure>
      </Container>
    </section>
  );
}
