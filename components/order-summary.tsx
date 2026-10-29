import { ProductArtworkView } from "@/components/product-artwork";
import { ScenePreview } from "@/components/scene-preview";
import { StudioPiece } from "@/components/studio-piece";
import { QrSlot } from "@/components/qr-slot";
import { ButtonLink } from "@/components/button-link";
import { OrderAccessLink } from "@/components/order-access-link";
import { OrderPaymentActions } from "@/components/order-payment-actions";
import { artworkExportFormats, signageFormatSpec, templateSpec } from "@/lib/artwork";
import { formatArs } from "@/lib/pricing";
import type { PaymentView } from "@/lib/payments/checkout-policy";
import type { StoredOrder } from "@/lib/orders";
import { pieceComposes } from "@/lib/print/layout";
import { renderArtworkSvg } from "@/lib/print/preview";

const viewLabel: Record<PaymentView, string> = {
  pending: "Pendiente de pago",
  verifying: "Pago en verificación",
  approved: "Pago aprobado",
  rejected: "Pago rechazado",
  cancelled: "Cancelado",
};

const viewCopy: Record<PaymentView, string> = {
  pending: "El pedido está pendiente de pago.",
  verifying:
    "Estamos verificando el pago con Mercado Pago. El regreso del navegador no alcanza para confirmarlo.",
  approved: "El pago quedó aprobado.",
  rejected: "El pago no se acreditó. El pedido sigue pendiente y podés intentar de nuevo.",
  cancelled: "El pedido está cancelado.",
};

const downloadLabel: Record<(typeof artworkExportFormats)[number], string> = {
  png: "PNG",
  svg: "SVG",
  pdf: "PDF",
};

export function OrderSummary({
  order,
  view,
  sandboxReady,
  downloads,
}: {
  order: StoredOrder;
  view: PaymentView;
  sandboxReady: boolean;
  downloads: boolean;
}) {
  const spec = templateSpec(order.artwork.templateId);
  const phrase =
    order.artwork.version === 1
      ? order.artwork.headline
      : order.artwork.version === 5 || order.artwork.version === 6
        ? order.artwork.message
        : order.artwork.subtitle;
  const sceneVersion =
    order.artwork.version === 3 || order.artwork.version === 4 || order.artwork.version === 5 || order.artwork.version === 6;
  const printSize =
    order.artwork.version === 5 || order.artwork.version === 6
      ? signageFormatSpec(order.artwork.format)
      : { widthMm: spec.widthMm, heightMm: spec.heightMm };
  const compositionOk = !sceneVersion || pieceComposes(order.artwork);
  const sceneSvg = sceneVersion && compositionOk ? safeScene(order.artwork) : null;
  const created = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(order.createdAt);
  const canPay =
    sandboxReady &&
    order.status === "PENDING" &&
    (view === "pending" || view === "rejected") &&
    compositionOk &&
    (!sceneVersion || sceneSvg !== null);
  const canVerify = sandboxReady && view === "verifying";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Pedido</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight">Resumen del pedido</h1>
        <p className="mt-4 text-lg text-muted" role="status">
          {viewLabel[view]}
        </p>
        <dl className="mt-8 space-y-4 text-sm">
          <div>
            <dt className="font-semibold">Identificador</dt>
            <dd className="mt-1 break-all font-mono text-muted">{order.publicId}</dd>
          </div>
          <div>
            <dt className="font-semibold">Fecha</dt>
            <dd className="mt-1 text-muted">{created}</dd>
          </div>
          <div>
            <dt className="font-semibold">Pieza</dt>
            <dd className="mt-1 text-muted">
              {spec.name} · {order.artwork.businessName} · {printSize.widthMm} × {printSize.heightMm} mm
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Texto</dt>
            <dd className="mt-1 text-muted">{phrase}</dd>
          </div>
          <div>
            <dt className="font-semibold">Total</dt>
            <dd className="mt-1 text-muted">{formatArs(order.amountArs)} ARS</dd>
          </div>
        </dl>
        <div className="mt-8 space-y-3 text-sm leading-relaxed text-muted">
          <p>{viewCopy[view]}</p>
          {!sandboxReady && order.status === "PENDING" ? (
            <p>
              El cobro no está configurado en el servidor. Desde esta pantalla no se puede marcar el pedido como pagado.
            </p>
          ) : null}
          {downloads ? (
            <p>La pieza se genera en el servidor con la plantilla, los textos, los colores y el QR guardados en el pedido.</p>
          ) : order.status === "PAID" ? (
            <p>
              Para descargar PNG, SVG y PDF, abrí este pedido en el navegador donde lo creaste. Desde otro
              dispositivo, pedí un enlace con el correo de la compra.
            </p>
          ) : order.status === "CANCELLED" ? null : (
            <p>PNG, SVG y PDF se habilitan cuando el pago queda confirmado.</p>
          )}
        </div>
        {downloads ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {artworkExportFormats.map((format) => (
              <a
                key={format}
                href={`/api/orders/${order.publicId}/files/${format}`}
                aria-label={`Descargar ${downloadLabel[format]}`}
                className="inline-flex h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong"
              >
                {downloadLabel[format]}
              </a>
            ))}
          </div>
        ) : null}
        {downloads ? <OrderAccessLink publicId={order.publicId} /> : null}
        {order.status === "PAID" && !downloads ? (
          <div className="mt-4">
            <ButtonLink href="/recuperar" variant="secondary">
              Recuperar descargas
            </ButtonLink>
          </div>
        ) : null}
        {sceneVersion && !compositionOk ? (
          <p role="alert" className="mt-4 rounded-2xl bg-danger-bg px-4 py-3 text-sm leading-relaxed text-danger">
            Esta pieza no entra en la plantilla. Volvé al editor y acortá el texto antes de pagar.
          </p>
        ) : null}
        {canPay ? <OrderPaymentActions publicId={order.publicId} mode="pay" /> : null}
        {canVerify ? <OrderPaymentActions publicId={order.publicId} mode="verify" /> : null}
        <div className="mt-8">
          <ButtonLink href="/crear" variant="secondary">
            Volver al editor
          </ButtonLink>
        </div>
      </div>
      {order.artwork.version === 1 ? (
        <ProductArtworkView artwork={order.artwork}>
          <QrSlot
            payload={
              order.artwork.href
                ? {
                    key: order.publicId,
                    href: order.artwork.href,
                    foreground: order.artwork.foreground,
                    background: order.artwork.background,
                    size: order.artwork.qrSize,
                  }
                : null
            }
          />
        </ProductArtworkView>
      ) : (order.artwork.version === 3 || order.artwork.version === 4 || order.artwork.version === 5 || order.artwork.version === 6) && sceneSvg ? (
        <ScenePreview svg={sceneSvg} />
      ) : order.artwork.version === 3 || order.artwork.version === 4 || order.artwork.version === 5 || order.artwork.version === 6 ? (
        <p role="alert" className="rounded-2xl bg-danger-bg px-4 py-6 text-sm leading-relaxed text-danger">
          No se puede mostrar esta pieza porque el texto no entra en la plantilla.
        </p>
      ) : (
        <StudioPiece artwork={order.artwork}>
          <QrSlot
            payload={
              order.artwork.href
                ? {
                    key: order.publicId,
                    href: order.artwork.href,
                    foreground: order.artwork.foreground,
                    background: order.artwork.background,
                    size: order.artwork.qrSize,
                  }
                : null
            }
          />
        </StudioPiece>
      )}
    </div>
  );
}

function safeScene(artwork: StoredOrder["artwork"]): string | null {
  try {
    return renderArtworkSvg(artwork);
  } catch {
    return null;
  }
}
