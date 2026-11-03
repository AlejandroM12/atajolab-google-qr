import { ProductArtworkView } from "@/components/product-artwork";
import { ScenePreview } from "@/components/scene-preview";
import { StudioPiece } from "@/components/studio-piece";
import { QrSlot } from "@/components/qr-slot";
import { ButtonLink } from "@/components/button-link";
import { OrderAccessLink } from "@/components/order-access-link";
import { OrderPaymentActions } from "@/components/order-payment-actions";
import { artworkExportFormats, premiumPhrases, premiumTemplates, signageFormatSpec, templateSpec } from "@/lib/artwork";
import { formatArs } from "@/lib/pricing";
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
  pending: "El pago todavía no está confirmado.",
  verifying:
    "Estamos verificando tu pago con Mercado Pago. Volver a esta página no significa que el pago esté confirmado.",
  approved: "Ya podés descargar los archivos.",
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
  if (order.artwork.version === STUDIO_COMMERCIAL_ARTWORK_VERSION) {
    return (
      <StudioV8OrderSummary
        order={{ ...order, artwork: order.artwork }}
        view={view}
        sandboxReady={sandboxReady}
        downloads={downloads}
      />
    );
  }

  const artwork = order.artwork;
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
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Tu compra</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight">Resumen de tu compra</h1>
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
            <dt className="font-semibold">Diseño</dt>
            <dd className="mt-1 text-muted">
              {[templateName, artwork.businessName, `${printSize.widthMm} × ${printSize.heightMm} mm`]
                .filter((part) => part.length > 0)
                .join(" · ")}
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
            <p>Descargá tus archivos. Se arman con el diseño, el texto y el código que guardaste.</p>
          ) : order.status === "PAID" ? (
            <p>
              Para descargar PNG, SVG y PDF, abrí esta compra en el navegador donde la creaste. Desde otro
              dispositivo, recuperá los archivos con el mismo correo.
            </p>
          ) : order.status === "CANCELLED" ? null : (
            <p>PNG, SVG y PDF se habilitan cuando el pago queda confirmado.</p>
          )}
        </div>
        {downloads ? (
          <div className="mt-4">
            <p className="text-sm font-semibold">Descargar mis archivos</p>
            <div className="mt-3 flex flex-wrap gap-3">
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
          </div>
        ) : null}
        {downloads ? <OrderAccessLink publicId={order.publicId} /> : null}
        {order.status === "PAID" && !downloads ? (
          <div className="mt-4">
            <ButtonLink href="/recuperar" variant="secondary">
              Recuperar mis descargas
            </ButtonLink>
          </div>
        ) : null}
        {sceneVersion && !compositionOk ? (
          <p role="alert" className="mt-4 rounded-2xl bg-danger-bg px-4 py-3 text-sm leading-relaxed text-danger">
            Este texto no entra en el diseño. Volvé al editor y acortalo antes de pagar.
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
      {artwork.version === 1 ? (
        <ProductArtworkView artwork={artwork}>
          <QrSlot
            payload={
              artwork.href
                ? {
                    key: order.publicId,
                    href: artwork.href,
                    foreground: artwork.foreground,
                    background: artwork.background,
                    size: artwork.qrSize,
                  }
                : null
            }
          />
        </ProductArtworkView>
      ) : (artwork.version === 3 || artwork.version === 4 || artwork.version === 5 || artwork.version === 6 || artwork.version === 7) && sceneSvg ? (
        <ScenePreview svg={sceneSvg} />
      ) : artwork.version === 3 || artwork.version === 4 || artwork.version === 5 || artwork.version === 6 || artwork.version === 7 ? (
        <p role="alert" className="rounded-2xl bg-danger-bg px-4 py-6 text-sm leading-relaxed text-danger">
          No se puede mostrar este diseño porque el texto no entra.
        </p>
      ) : (
        <StudioPiece artwork={artwork}>
          <QrSlot
            payload={
              artwork.href
                ? {
                    key: order.publicId,
                    href: artwork.href,
                    foreground: artwork.foreground,
                    background: artwork.background,
                    size: artwork.qrSize,
                  }
                : null
            }
          />
        </StudioPiece>
      )}
    </div>
  );
}

function StudioV8OrderSummary({
  order,
  view,
  sandboxReady,
  downloads,
}: {
  order: StoredOrder & { artwork: Extract<StoredOrder["artwork"], { version: typeof STUDIO_COMMERCIAL_ARTWORK_VERSION }> };
  view: PaymentView;
  sandboxReady: boolean;
  downloads: boolean;
}) {
  const artwork = order.artwork;
  const templateName = templateList.find((item) => item.id === artwork.templateId)?.name ?? "Studio";
  const created = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(order.createdAt);
  const frozen = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(artwork.frozenAt));

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Tu compra</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight">Resumen de tu compra</h1>
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
            <dt className="font-semibold">Diseño</dt>
            <dd className="mt-1 text-muted">
              {[templateName, artwork.title, `${artwork.format.widthMm} × ${artwork.format.heightMm} mm`]
                .filter((part) => part.length > 0)
                .join(" · ")}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Texto</dt>
            <dd className="mt-1 text-muted">{artwork.title}</dd>
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
            <p>Descargá tus archivos Studio. Se arman con el diseño congelado al crear el pedido.</p>
          ) : order.status === "PAID" ? (
            <p>
              Para descargar PNG, SVG y PDF, abrí esta compra en el navegador donde la creaste. Desde otro
              dispositivo, recuperá los archivos con el mismo correo.
            </p>
          ) : order.status === "CANCELLED" ? null : (
            <p>PNG, SVG y PDF se habilitan cuando el pago queda confirmado. El cobro desde Studio llega en un paso posterior.</p>
          )}
        </div>
        {downloads ? (
          <div className="mt-4">
            <p className="text-sm font-semibold">Descargar mis archivos</p>
            <div className="mt-3 flex flex-wrap gap-3">
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
          </div>
        ) : null}
        {downloads ? <OrderAccessLink publicId={order.publicId} /> : null}
        {order.status === "PAID" && !downloads ? (
          <div className="mt-4">
            <ButtonLink href="/recuperar" variant="secondary">
              Recuperar mis descargas
            </ButtonLink>
          </div>
        ) : null}
        <div className="mt-8">
          <ButtonLink href="/studio" variant="secondary">
            Volver al editor
          </ButtonLink>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-surface px-5 py-6 text-sm leading-relaxed text-muted">
        <p className="font-semibold text-ink">Studio A6</p>
        <p className="mt-2">{artwork.title}</p>
        <p className="mt-2 font-mono text-xs break-all">{artwork.href}</p>
        <p className="mt-4 text-xs">Snapshot congelado · {frozen}</p>
      </div>
    </div>
  );
}

function safeScene(artwork: Exclude<StoredOrder["artwork"], { version: typeof STUDIO_COMMERCIAL_ARTWORK_VERSION }>): string | null {
  try {
    return renderArtworkSvg(artwork);
  } catch {
    return null;
  }
}
