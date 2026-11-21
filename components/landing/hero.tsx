import QRCode from "qrcode";
import { ButtonLink } from "@/components/button-link";
import { Container } from "@/components/container";
import { FreeFirstNote } from "@/components/landing/free-first-note";
import { SalesAware } from "@/components/sales-aware";
import { heroTrustLine } from "@/lib/commercial-copy";
import { getInspiration, type InspirationId } from "@/lib/studio/inspiration";
import { inspirationPreviewSize, inspirationPreviewUrl } from "@/lib/studio/inspiration-preview-url";

/** Where the demo QR leads: AtajoLab itself, so scanning it lets people try the product. */
const REVIEW_DEMO_URL = "https://qr.atajolab.dev/empezar";

/** Two real examples, fanned out behind the review card. Classes place each one. */
const SHOWCASE: { id: InspirationId; className: string }[] = [
  { id: "menu", className: "left-0 top-[14%] w-[44%] -rotate-6" },
  { id: "instagram", className: "right-0 top-[4%] w-[50%] rotate-6" },
];

/**
 * The front card: a Google review QR drawn as a card, on top of the examples.
 * The QR is built synchronously as an inline SVG, so it stays sharp at any
 * width. Sizes are in container units (cqw), so the card scales like the
 * image examples.
 */
function ReviewCard({ className }: { className: string }) {
  const { modules } = QRCode.create(REVIEW_DEMO_URL, { errorCorrectionLevel: "M" });
  let dark = "";
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) dark += `M${col} ${row}h1v1h-1z`;
    }
  }
  return (
    <div
      aria-hidden="true"
      className={`@container absolute aspect-[105/148] overflow-hidden rounded-lg border border-line bg-card shadow-[0_18px_40px_rgba(20,34,31,0.22)] ${className}`}
    >
      <div className="absolute inset-0 h-1.5 bg-accent" />
      <div className="flex h-full flex-col items-center justify-between px-[9cqw] pb-[8cqw] pt-[10cqw] text-center">
        <div className="w-full">
          <p className="text-[6cqw] leading-none tracking-[0.2em] text-accent">★★★★★</p>
          <p className="mt-[5cqw] font-display text-[8cqw] font-semibold leading-[1.1] text-foreground">
            Tu opinión nos ayuda
          </p>
          <p className="mt-[2.5cqw] text-[4.2cqw] leading-snug text-muted">Dejanos una reseña en Google</p>
        </div>
        <div className="rounded-[4cqw] bg-white p-[3cqw] ring-1 ring-line">
          <svg
            viewBox={`-1 -1 ${modules.size + 2} ${modules.size + 2}`}
            shapeRendering="crispEdges"
            aria-hidden="true"
            className="block h-[50cqw] w-[50cqw]"
          >
            <path d={dark} fill="#14221f" />
          </svg>
        </div>
        <div className="w-full">
          <p className="w-full rounded-full bg-accent px-[4cqw] py-[2.5cqw] text-[4.4cqw] font-semibold text-white">
            Escaneá y calificanos
          </p>
          <p className="mt-[2.5cqw] text-[3.2cqw] leading-snug text-muted">Demo de diseño · el QR abre AtajoLab</p>
        </div>
      </div>
    </div>
  );
}

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
            <SalesAware fallback={heroTrustLine(false)}>{(salesOpen) => heroTrustLine(salesOpen)}</SalesAware>
          </p>
        </div>
        <div className="relative mx-auto aspect-[10/9] w-full max-w-md lg:max-w-none" role="img" aria-label="Ejemplos de diseños: carta de un restaurante, perfil de Instagram y reseñas de Google">
          {SHOWCASE.map((item) => {
            const size = inspirationPreviewSize(item.id);
            return (
              // eslint-disable-next-line @next/next/no-img-element -- prebuilt same-origin WebP (app/previews), already sized
              <img
                key={item.id}
                src={inspirationPreviewUrl(item.id)}
                width={size.width}
                height={size.height}
                decoding="async"
                alt=""
                title={getInspiration(item.id)?.name}
                className={`absolute h-auto rounded-lg shadow-[0_18px_40px_rgba(20,34,31,0.22)] ${item.className}`}
              />
            );
          })}
          <ReviewCard className="left-[27%] top-[22%] z-10 w-[47%]" />
        </div>
      </Container>
    </section>
  );
}
