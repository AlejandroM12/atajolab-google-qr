import Link from "next/link";
import type { ReactNode } from "react";
import { ProductArtworkView } from "@/components/product-artwork";
import { ScenePreview } from "@/components/scene-preview";
import { StudioPiece } from "@/components/studio-piece";
import { QrSlot, type QrPayload } from "@/components/qr-slot";
import { ButtonLink } from "@/components/button-link";
import { OrderAccessLink } from "@/components/order-access-link";
import { LockedDownloads, OrderDownloads } from "@/components/order-downloads";
import { OrderPaymentActions } from "@/components/order-payment-actions";
import { premiumPhrases, premiumTemplates, signageFormatSpec, templateSpec } from "@/lib/artwork";
import { SalesAware } from "@/components/sales-aware";
import { orderFreeNote } from "@/lib/commercial-copy";
import { formatArs } from "@/lib/pricing";
import { orderDeliverable } from "@/lib/delivery";
import type { PaymentView } from "@/lib/payments/checkout-policy";
import type { StoredOrder } from "@/lib/orders";
import { pieceComposes } from "@/lib/print/layout";
import { renderArtworkSvg } from "@/lib/print/preview";
import { STUDIO_COMMERCIAL_ARTWORK_VERSION } from "@/lib/studio/commercial-artwork";
import { templateList } from "@/lib/studio/templates";

type Tone = "ok" | "warn" | "danger" | "neutral";

/** What the page says for each real state of the order. A success is shown only once it is PAID or FREE. */
const STATES = {
  ready: { tone: "ok", title: "¡Tu diseño está listo!", pill: "Compra confirmada", lead: "Elegí el formato que necesites y descargalo." },
  free: { tone: "ok", title: "¡Tu diseño está listo!", pill: "Tu primer QR gratis", lead: "Elegí el formato que necesites y descargalo." },
  elsewhere: {
    tone: "ok",
    title: "¡Tu diseño está listo!",
    pill: "Compra confirmada",
    lead: "Para descargarlo, abrí esta página en el navegador donde hiciste el pedido o recuperá tus archivos con tu correo.",
  },
  pending: { tone: "warn", title: "Tu pedido espera el pago", pill: "Pago pendiente", lead: "Pagá con Mercado Pago y habilitamos tus archivos al instante." },
  unpayable: {
    tone: "warn",
    title: "Tu pedido está guardado",
    pill: "Pago pendiente",
    lead: "Por ahora no podemos tomar pagos en línea. Guardá este enlace y volvé más tarde.",
  },
  verifying: {
    tone: "warn",
    title: "Estamos confirmando tu pago",
    pill: "Verificando el pago",
    lead: "Mercado Pago suele confirmarlo en unos segundos; si pagaste en efectivo puede demorar más. Esta página se actualiza sola.",
  },
  rejected: {
    tone: "danger",
    title: "El pago no se acreditó",
    pill: "Pago rechazado",
    lead: "Tu pedido sigue guardado y podés intentar de nuevo.",
  },
  cancelled: { tone: "neutral", title: "Este pedido fue cancelado", pill: "Cancelado", lead: "No se habilitan archivos para un pedido cancelado." },
} as const satisfies Record<string, { tone: Tone; title: string; pill: string; lead: string }>;

const PILL_TONE: Record<Tone, string> = {
  ok: "border-accent/30 bg-ok-bg text-accent-strong",
  warn: "border-warning/30 bg-warning-bg text-warning",
  danger: "border-danger/30 bg-danger-bg text-danger",
  neutral: "border-line bg-card text-muted",
};

type StudioOrder = StoredOrder & {
  artwork: Extract<StoredOrder["artwork"], { version: typeof STUDIO_COMMERCIAL_ARTWORK_VERSION }>;
};
type LegacyArtwork = Exclude<StoredOrder["artwork"], { version: typeof STUDIO_COMMERCIAL_ARTWORK_VERSION }>;

export function OrderSummary({
  order,
  view,
  sandboxReady,
  downloads,
  studioPreview = null,
}: {
  order: StoredOrder;
  view: PaymentView;
  /** Payments are configured and the token owner matches the environment. */
  sandboxReady: boolean;
  downloads: boolean;
  /** Studio v8 preview, streamed so the page does not wait for it (optional). */
  studioPreview?: ReactNode;
}) {
  if (order.artwork.version === STUDIO_COMMERCIAL_ARTWORK_VERSION) {
    return (
      <StudioV8OrderSummary
        order={{ ...order, artwork: order.artwork }}
        view={view}
        paymentsReady={sandboxReady}
        downloads={downloads}
        studioPreview={studioPreview}
      />
    );
  }
  return (
    <LegacyOrderSummary
      order={order}
      artwork={order.artwork as LegacyArtwork}
      view={view}
      paymentsReady={sandboxReady}
      downloads={downloads}
    />
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Shared status, downloads, secondary details and payment actions for every artwork version. */
function OrderLayout({
  order,
  view,
  paymentsReady,
  downloads,
  design,
  text,
  canPay,
  notes,
  alert,
  preview,
}: {
  order: StoredOrder;
  view: PaymentView;
  paymentsReady: boolean;
  downloads: boolean;
  design: string;
  text: string;
  /** Extra version-specific checks that allow paying (composition, preview). */
  canPay: boolean;
  notes?: ReactNode;
  /** Something to fix before paying: always visible, never folded away. */
  alert?: ReactNode;
  preview: ReactNode;
}) {
  const created = new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short" }).format(
    order.createdAt,
  );
  const payable = paymentsReady && canPay && order.status === "PENDING" && (view === "pending" || view === "rejected");
  const verifying = paymentsReady && view === "verifying";
  // "Tu primer QR es gratis": same files as a purchase, no payment involved.
  const free = order.status === "FREE";
  const deliverable = orderDeliverable(order.status);

  const key: keyof typeof STATES = deliverable
    ? downloads
      ? free
        ? "free"
        : "ready"
      : "elsewhere"
    : view === "cancelled"
      ? "cancelled"
      : view === "rejected"
        ? "rejected"
        : view === "verifying"
          ? "verifying"
          : payable
            ? "pending"
            : "unpayable";
  const state = STATES[key];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)]">
        <header className="lg:col-start-1 lg:row-start-1">
          <p
            role="status"
            data-testid="estado-pedido"
            data-state={key}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${PILL_TONE[state.tone]}`}
          >
            <span aria-hidden="true" className="size-2 rounded-full bg-current" />
            {state.pill}
          </p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">{state.title}</h1>
          <p className="mt-3 text-base leading-relaxed text-muted sm:text-lg">{state.lead}</p>
        </header>

        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start lg:sticky lg:top-6">{preview}</div>

        <div className="lg:col-start-1 lg:row-start-2">
          {downloads ? <OrderDownloads publicId={order.publicId} /> : null}
          {deliverable && !downloads ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/recuperar" className="h-12 px-6 text-base">
                Recuperar mis archivos
              </ButtonLink>
            </div>
          ) : null}
          {!deliverable && view !== "cancelled" ? <LockedDownloads waiting={key === "verifying"} /> : null}
          {alert}
          {payable ? <OrderPaymentActions publicId={order.publicId} mode="pay" /> : null}
          {verifying ? <OrderPaymentActions publicId={order.publicId} mode="verify" /> : null}

          <details className="group mt-8 rounded-2xl border border-line bg-card">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              Detalles del pedido
              <Chevron />
            </summary>
            <div className="border-t border-line px-4 py-4">
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Número de pedido</dt>
                  <dd className="mt-0.5 break-all font-mono">{order.publicId}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Fecha</dt>
                  <dd className="mt-0.5">{created}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Total</dt>
                  <dd className="mt-0.5">{free ? "Gratis" : `${formatArs(order.amountArs)} (ARS, pago único)`}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Diseño</dt>
                  <dd className="mt-0.5">{design}</dd>
                </div>
                {text ? (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Texto</dt>
                    <dd className="mt-0.5 break-words">{text}</dd>
                  </div>
                ) : null}
              </dl>
              {notes ? <div className="mt-4 text-sm leading-relaxed text-muted">{notes}</div> : null}
              {free ? (
                <p className="mt-4 text-sm leading-relaxed text-muted">
                  <SalesAware fallback={orderFreeNote(false)}>{(salesOpen) => orderFreeNote(salesOpen)}</SalesAware>
                </p>
              ) : null}
            </div>
          </details>

          {downloads ? (
            <details className="group mt-3 rounded-2xl border border-line bg-card">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                Abrirlo en otro dispositivo
                <Chevron />
              </summary>
              <div className="border-t border-line px-4 pb-4">
                <OrderAccessLink publicId={order.publicId} />
                <p className="mt-3 text-sm text-muted">
                  O pedí un acceso nuevo cuando quieras con tu correo en{" "}
                  <Link className="font-semibold text-accent underline-offset-4 hover:underline" href="/recuperar">
                    Recuperar mis archivos
                  </Link>
                  .
                </p>
              </div>
            </details>
          ) : null}

          <p className="mt-8 text-sm leading-6 text-muted">
            ¿Necesitás ayuda? Escribinos desde{" "}
            <Link className="underline" href="/contacto">
              Contacto
            </Link>{" "}
            con tu número de pedido. Podés revisar la{" "}
            <Link className="underline" href="/reembolsos">
              política de reembolsos
            </Link>
            .
          </p>
          <div className="mt-6">
            <ButtonLink href="/crear" variant="secondary">
              Volver al editor
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudioV8OrderSummary({
  order,
  view,
  paymentsReady,
  downloads,
  studioPreview,
}: {
  order: StudioOrder;
  view: PaymentView;
  paymentsReady: boolean;
  downloads: boolean;
  studioPreview: ReactNode;
}) {
  const artwork = order.artwork;
  const templateName = templateList.find((item) => item.id === artwork.templateId)?.name ?? "Studio";
  const frozen = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(artwork.frozenAt),
  );

  return (
    <OrderLayout
      order={order}
      view={view}
      paymentsReady={paymentsReady}
      downloads={downloads}
      design={[templateName, `${artwork.format.widthMm} × ${artwork.format.heightMm} mm`].join(" · ")}
      text={artwork.title}
      canPay
      notes={
        <p>
          El pedido guarda una copia del diseño tal como estaba al crearlo. Si después cambiás algo en el editor,
          esta compra no cambia.
        </p>
      }
      preview={
        <figure className="mx-auto w-full max-w-[16rem] lg:max-w-none">
          <div className="rounded-3xl border border-line bg-card p-3 shadow-[0_18px_40px_rgba(20,34,31,0.12)] sm:p-4">
            {studioPreview ?? (
              <div
                className="flex w-full flex-col justify-between rounded-xl bg-background px-5 py-6 text-center"
                style={{ aspectRatio: `${artwork.format.widthMm} / ${artwork.format.heightMm}` }}
                aria-label="Vista previa del diseño"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{templateName}</p>
                <p className="text-2xl font-semibold leading-snug text-foreground">{artwork.title}</p>
              </div>
            )}
          </div>
          <figcaption className="mt-3 text-center text-xs text-muted">Diseño guardado · {frozen}</figcaption>
        </figure>
      }
    />
  );
}

function LegacyOrderSummary({
  order,
  artwork,
  view,
  paymentsReady,
  downloads,
}: {
  order: StoredOrder;
  artwork: LegacyArtwork;
  view: PaymentView;
  paymentsReady: boolean;
  downloads: boolean;
}) {
  const templateName =
    artwork.version === 7
      ? (premiumTemplates.find((item) => item.id === artwork.templateId)?.name ?? "Plantilla")
      : templateSpec(artwork.templateId).name;
  const phrase =
    artwork.version === 1
      ? artwork.headline
      : artwork.version === 7
        ? premiumPhrases(artwork.templateId, artwork.objective, artwork.message).shout
        : artwork.version === 5 || artwork.version === 6
          ? artwork.message
          : artwork.subtitle;
  const sceneVersion =
    artwork.version === 3 ||
    artwork.version === 4 ||
    artwork.version === 5 ||
    artwork.version === 6 ||
    artwork.version === 7;
  const printSize =
    artwork.version === 5 || artwork.version === 6 || artwork.version === 7
      ? signageFormatSpec(artwork.format)
      : {
          widthMm: templateSpec(artwork.templateId).widthMm,
          heightMm: templateSpec(artwork.templateId).heightMm,
        };
  const compositionOk = !sceneVersion || pieceComposes(artwork);
  const sceneSvg = sceneVersion && compositionOk ? safeScene(artwork) : null;
  let preview: ReactNode;
  if (artwork.version === 1) {
    preview = (
      <ProductArtworkView artwork={artwork}>
        <QrSlot payload={qrPayloadFor(order.publicId, artwork)} />
      </ProductArtworkView>
    );
  } else if (sceneVersion && sceneSvg) {
    preview = <ScenePreview svg={sceneSvg} />;
  } else if (
    artwork.version === 3 ||
    artwork.version === 4 ||
    artwork.version === 5 ||
    artwork.version === 6 ||
    artwork.version === 7
  ) {
    preview = (
      <p role="alert" className="rounded-2xl bg-danger-bg px-4 py-6 text-sm leading-relaxed text-danger">
        No se puede mostrar este diseño porque el texto no entra.
      </p>
    );
  } else {
    preview = (
      <StudioPiece artwork={artwork}>
        <QrSlot payload={qrPayloadFor(order.publicId, artwork)} />
      </StudioPiece>
    );
  }

  return (
    <OrderLayout
      order={order}
      view={view}
      paymentsReady={paymentsReady}
      downloads={downloads}
      design={[templateName, artwork.businessName, `${printSize.widthMm} × ${printSize.heightMm} mm`]
        .filter((part) => part.length > 0)
        .join(" · ")}
      text={phrase}
      canPay={compositionOk && (!sceneVersion || sceneSvg !== null)}
      alert={
        sceneVersion && !compositionOk ? (
          <p role="alert" className="rounded-2xl bg-danger-bg px-4 py-3 text-sm leading-relaxed text-danger">
            Este texto no entra en el diseño. Volvé al editor y acortalo antes de pagar.
          </p>
        ) : null
      }
      preview={
        <div className="mx-auto w-full max-w-[16rem] rounded-3xl border border-line bg-card p-3 shadow-[0_18px_40px_rgba(20,34,31,0.12)] sm:p-4 lg:max-w-none">
          {preview}
        </div>
      }
    />
  );
}

function qrPayloadFor(
  key: string,
  artwork: Pick<QrPayload, "foreground" | "background"> & { href: string | null; qrSize: QrPayload["size"] },
): QrPayload | null {
  return artwork.href
    ? { key, href: artwork.href, foreground: artwork.foreground, background: artwork.background, size: artwork.qrSize }
    : null;
}

function safeScene(artwork: LegacyArtwork): string | null {
  try {
    return renderArtworkSvg(artwork);
  } catch {
    return null;
  }
}
