import Link from "next/link";
import type { ReactNode } from "react";
import { ProductArtworkView } from "@/components/product-artwork";
import { ScenePreview } from "@/components/scene-preview";
import { StudioPiece } from "@/components/studio-piece";
import { QrSlot, type QrPayload } from "@/components/qr-slot";
import { ButtonLink } from "@/components/button-link";
import { OrderAccessLink } from "@/components/order-access-link";
import { OrderDownloads } from "@/components/order-downloads";
import { OrderPaymentActions } from "@/components/order-payment-actions";
import { premiumPhrases, premiumTemplates, signageFormatSpec, templateSpec } from "@/lib/artwork";
import { formatArs, PIECE_CURRENCY, PIECE_PRICE_ARS } from "@/lib/pricing";
import { orderDeliverable } from "@/lib/delivery";
import type { PaymentView } from "@/lib/payments/checkout-policy";
import type { StoredOrder } from "@/lib/orders";
import { pieceComposes } from "@/lib/print/layout";
import { renderArtworkSvg } from "@/lib/print/preview";
import { STUDIO_COMMERCIAL_ARTWORK_VERSION } from "@/lib/studio/commercial-artwork";
import { templateList } from "@/lib/studio/templates";

const viewLabel: Record<PaymentView, string> = {
  pending: "Pendiente de pago",
  verifying: "Pago en verificación",
  approved: "Tu compra está confirmada",
  rejected: "Pago rechazado",
  cancelled: "Cancelado",
};

const viewCopy: Record<PaymentView, string> = {
  pending: "Revisá el diseño y pagá con Mercado Pago para habilitar las descargas.",
  verifying:
    "Mercado Pago está confirmando tu pago. Suele tardar unos segundos; si pagaste en efectivo puede demorar más.",
  approved: "Ya podés descargar los archivos. Si dejaste tu correo, también te enviamos el acceso.",
  rejected: "El pago no se acreditó. El pedido sigue pendiente y podés intentar de nuevo.",
  cancelled: "El pedido está cancelado.",
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
  studioPreviewSvg = null,
}: {
  order: StoredOrder;
  view: PaymentView;
  /** Payments are configured and the token owner matches the environment. */
  sandboxReady: boolean;
  downloads: boolean;
  /** Server-rendered SVG for Studio v8 frozen artwork (optional). */
  studioPreviewSvg?: string | null;
}) {
  if (order.artwork.version === STUDIO_COMMERCIAL_ARTWORK_VERSION) {
    return (
      <StudioV8OrderSummary
        order={{ ...order, artwork: order.artwork }}
        view={view}
        paymentsReady={sandboxReady}
        downloads={downloads}
        previewSvg={studioPreviewSvg}
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

/** Shared status, details, downloads and payment actions for every artwork version. */
function OrderLayout({
  order,
  view,
  paymentsReady,
  downloads,
  design,
  text,
  canPay,
  notes,
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
  preview: ReactNode;
}) {
  const created = new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short" }).format(
    order.createdAt,
  );
  const payable = paymentsReady && canPay && order.status === "PENDING" && (view === "pending" || view === "rejected");
  const verifying = paymentsReady && view === "verifying";
  // "Tu primer QR es gratis": same files as a purchase, no payment involved.
  const free = order.status === "FREE";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Tu compra</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight">Resumen de tu compra</h1>
        <p className="mt-4 text-lg text-muted" role="status">
          {free ? "Tu primer QR gratis está listo" : viewLabel[view]}
        </p>
        <dl className="mt-8 space-y-4 text-sm">
          <div>
            <dt className="font-semibold">Número de pedido</dt>
            <dd className="mt-1 break-all font-mono text-muted">{order.publicId}</dd>
          </div>
          <div>
            <dt className="font-semibold">Fecha</dt>
            <dd className="mt-1 text-muted">{created}</dd>
          </div>
          <div>
            <dt className="font-semibold">Diseño</dt>
            <dd className="mt-1 text-muted">{design}</dd>
          </div>
          {text ? (
            <div>
              <dt className="font-semibold">Texto</dt>
              <dd className="mt-1 text-muted">{text}</dd>
            </div>
          ) : null}
          <div>
            <dt className="font-semibold">Total</dt>
            <dd className="mt-1 text-muted">
              {free ? "Gratis · Tu primer QR es gratis" : `${formatArs(order.amountArs)} (ARS, pago único)`}
            </dd>
          </div>
        </dl>
        <div className="mt-8 space-y-3 text-sm leading-relaxed text-muted">
          <p>
            {free
              ? `Ya podés descargar los archivos. Los siguientes QR cuestan ${formatArs(PIECE_PRICE_ARS)} ${PIECE_CURRENCY}.`
              : viewCopy[view]}
          </p>
          {notes}
          {!paymentsReady && order.status === "PENDING" ? (
            <p>Por ahora no podemos tomar pagos en línea. Guardá este enlace y volvé a intentarlo más tarde.</p>
          ) : null}
          {downloads ? null : orderDeliverable(order.status) ? (
            <p>
              Para descargar PNG, SVG y PDF, abrí esta compra en el navegador donde la creaste. Desde otro
              dispositivo, recuperá los archivos con el mismo correo.
            </p>
          ) : order.status === "CANCELLED" ? null : (
            <p>PNG, SVG y PDF se habilitan cuando el pago queda confirmado.</p>
          )}
        </div>
        {downloads ? <OrderDownloads publicId={order.publicId} /> : null}
        {downloads ? <OrderAccessLink publicId={order.publicId} /> : null}
        {orderDeliverable(order.status) && !downloads ? (
          <div className="mt-4">
            <ButtonLink href="/recuperar" variant="secondary">
              Recuperar mis descargas
            </ButtonLink>
          </div>
        ) : null}
        {payable ? <OrderPaymentActions publicId={order.publicId} mode="pay" /> : null}
        {verifying ? <OrderPaymentActions publicId={order.publicId} mode="verify" /> : null}
        <p className="mt-6 text-xs leading-5 text-muted">
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
        <div className="mt-8">
          <ButtonLink href="/crear" variant="secondary">
            Volver al editor
          </ButtonLink>
        </div>
      </div>
      {preview}
    </div>
  );
}

function StudioV8OrderSummary({
  order,
  view,
  paymentsReady,
  downloads,
  previewSvg,
}: {
  order: StudioOrder;
  view: PaymentView;
  paymentsReady: boolean;
  downloads: boolean;
  previewSvg: string | null;
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
        <div className="justify-self-center lg:justify-self-end">
          {previewSvg ? (
            <div>
              <ScenePreview svg={previewSvg} />
              <p className="mt-3 text-center text-xs text-muted">Diseño guardado · {frozen}</p>
            </div>
          ) : (
            <div
              className="flex w-full max-w-[20rem] flex-col justify-between rounded-sm border border-line bg-card px-5 py-6 text-center"
              style={{ aspectRatio: `${artwork.format.widthMm} / ${artwork.format.heightMm}` }}
              aria-label="Vista previa del diseño"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{templateName}</p>
              <p className="text-2xl font-semibold leading-snug text-foreground">{artwork.title}</p>
              <p className="text-xs text-muted">Diseño guardado · {frozen}</p>
            </div>
          )}
        </div>
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
      notes={
        sceneVersion && !compositionOk ? (
          <p role="alert" className="rounded-2xl bg-danger-bg px-4 py-3 text-sm leading-relaxed text-danger">
            Este texto no entra en el diseño. Volvé al editor y acortalo antes de pagar.
          </p>
        ) : null
      }
      preview={preview}
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
