import { ButtonLink } from "@/components/button-link";
import { Container } from "@/components/container";
import { FreeFirstNote } from "@/components/landing/free-first-note";
import { getInspiration, type InspirationId } from "@/lib/studio/inspiration";
import { inspirationPreviewSize, inspirationPreviewUrl } from "@/lib/studio/inspiration-preview-url";

/** Three real examples, fanned out. Classes place each one; the middle one sits on top. */
const SHOWCASE: { id: InspirationId; className: string }[] = [
  { id: "menu", className: "left-0 top-[14%] w-[44%] -rotate-6" },
  { id: "instagram", className: "right-0 top-[4%] w-[50%] rotate-6" },
  { id: "whatsapp", className: "left-[27%] top-[22%] z-10 w-[47%]" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,110,98,0.16),transparent_42%)]"
      />
      <Container className="relative grid items-center gap-10 py-12 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)] lg:py-24">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Para comercios y profesionales
          </p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.05] text-foreground sm:text-6xl">
            Tu código QR, con un diseño listo para usar
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Para tus redes, WhatsApp, el menú, un evento, el Wi-Fi o tus reseñas de Google. Elegí qué compartir y
            llevate el diseño listo para imprimir o publicar.
          </p>
          <FreeFirstNote variant="hero" />
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/empezar" className="h-12 px-7 text-base">
              Crear mi QR
            </ButtonLink>
            <ButtonLink href="/#ejemplos" variant="secondary" className="h-12">
              Ver ejemplos
            </ButtonLink>
          </div>
          <p className="mt-5 text-sm font-semibold text-foreground/80">
            Sin registrarte · Pago con Mercado Pago · Descarga digital
          </p>
        </div>
        <div className="relative mx-auto aspect-[10/9] w-full max-w-md lg:max-w-none" role="img" aria-label="Ejemplos de diseños: carta de un restaurante, perfil de Instagram y pedidos por WhatsApp">
          {SHOWCASE.map((item, index) => {
            const size = inspirationPreviewSize(item.id);
            return (
              // eslint-disable-next-line @next/next/no-img-element -- prebuilt same-origin WebP (app/previews), already sized
              <img
                key={item.id}
                src={inspirationPreviewUrl(item.id)}
                width={size.width}
                height={size.height}
                fetchPriority={index === 2 ? "high" : "auto"}
                decoding="async"
                alt=""
                title={getInspiration(item.id)?.name}
                className={`absolute h-auto rounded-lg shadow-[0_18px_40px_rgba(20,34,31,0.22)] ${item.className}`}
              />
            );
          })}
        </div>
      </Container>
    </section>
  );
}
