import type { Metadata } from "next";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Container } from "@/components/container";
import { OrderSkeleton, PreviewSkeleton } from "@/components/order-skeleton";
import { OrderSummary } from "@/components/order-summary";
import { ScenePreview } from "@/components/scene-preview";
import type { StoredOrder } from "@/lib/orders";
import { DIGITAL_DOWNLOADS_ENABLED } from "@/lib/delivery";
import { applyVerifiedPayment, findOrder, findOrderAccessHashes, findPaymentRecord } from "@/lib/orders";
import { digitalDeliveryAllowed, orderAccessCookieName, readOrderAccess } from "@/lib/payments/access";
import { STUDIO_COMMERCIAL_ARTWORK_VERSION } from "@/lib/studio/commercial-artwork";
import { renderStudioOrderPreviewSvg } from "@/lib/studio/order-preview";
import {
  createReconcileLimiter,
  credentialOwnerMatches,
  parseReturnHint,
  paymentView,
} from "@/lib/payments/checkout-policy";
import { reconcilePayment } from "@/lib/payments/checkout-service";
import { paymentRuntime } from "@/lib/payments/mercadopago";
import { logError, logWarn } from "@/lib/log";

export const metadata: Metadata = {
  title: "Tu compra",
  description: "Estado de tu compra y descarga de los archivos para imprimir.",
  // Private order page: never indexed, never followed.
  robots: { index: false, follow: false, nocache: true },
};

type SearchParams = Record<string, string | string[] | undefined>;

const reconcileLimiter = createReconcileLimiter();

export default function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  return (
    <main>
      <Container className="py-10 sm:py-14">
        <Suspense fallback={<OrderSkeleton />}>
          <OrderLoader params={params} searchParams={searchParams} />
        </Suspense>
      </Container>
    </main>
  );
}

async function OrderLoader({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  const { publicId } = await params;
  const query = await searchParams;
  const hint = parseReturnHint(first(query.retorno));
  let order = await findOrder(publicId);
  if (!order) notFound();

  const runtime = await paymentRuntime();
  const paymentsReady = credentialOwnerMatches(process.env.MERCADOPAGO_ENV, runtime.owner);
  const jar = await cookies();
  const accessCookie = jar.get(orderAccessCookieName(publicId))?.value;
  const deliveryKey = readOrderAccess(
    accessCookie ? `${orderAccessCookieName(publicId)}=${accessCookie}` : null,
    publicId,
  );

  if (
    order.status === "PENDING" &&
    deliveryKey &&
    paymentsReady &&
    reconcileLimiter.allow(publicId)
  ) {
    try {
      const hinted = paymentHint(first(query.payment_id) ?? first(query.collection_id));
      const result = await reconcilePayment({
        publicId,
        body: hinted ? { paymentId: hinted } : {},
        deliveryKey,
        accessToken: runtime.token,
        gateway: runtime.gateway,
        store: { find: findPaymentRecord, apply: applyVerifiedPayment },
      });
      if (!result.ok) {
        logWarn("payment.page-reconcile-failed", { publicId, error: result.error });
      } else {
        order = (await findOrder(publicId)) ?? order;
      }
    } catch (error) {
      logError("payment.page-reconcile-threw", error, { publicId });
    }
  }

  const hashes = await findOrderAccessHashes(publicId);
  const downloads = digitalDeliveryAllowed({
    downloadsEnabled: DIGITAL_DOWNLOADS_ENABLED,
    status: order.status,
    key: deliveryKey,
    storedHash: hashes[0] ?? null,
    extraHashes: hashes.slice(1),
  });

  // The preview is drawn while the rest of the page is already on screen.
  const studioPreview =
    order.artwork.version === STUDIO_COMMERCIAL_ARTWORK_VERSION ? (
      <Suspense fallback={<PreviewSkeleton />}>
        <StudioPreview order={order} />
      </Suspense>
    ) : null;

  return (
    <OrderSummary
      order={order}
      sandboxReady={paymentsReady}
      downloads={downloads}
      studioPreview={studioPreview}
      view={paymentView({
        orderStatus: order.status,
        hint,
        externalStatus: order.externalPaymentStatus,
      })}
    />
  );
}

async function StudioPreview({ order }: { order: StoredOrder }) {
  if (order.artwork.version !== STUDIO_COMMERCIAL_ARTWORK_VERSION) return null;
  const svg = await renderStudioOrderPreviewSvg({ orderId: order.publicId, artwork: order.artwork });
  return svg ? (
    <ScenePreview svg={svg} />
  ) : (
    <p className="px-4 py-10 text-center text-sm text-muted">No pudimos mostrar la vista previa, pero tus archivos están intactos.</p>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function paymentHint(value: string | undefined): string | null {
  return value && /^\d{1,32}$/.test(value) ? value : null;
}
