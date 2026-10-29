import type { Metadata } from "next";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Container } from "@/components/container";
import { OrderSummary } from "@/components/order-summary";
import { DIGITAL_DOWNLOADS_ENABLED } from "@/lib/delivery";
import { applyVerifiedPayment, findOrder, findOrderAccessHashes, findPaymentRecord } from "@/lib/orders";
import { digitalDeliveryAllowed, orderAccessCookieName, readOrderAccess } from "@/lib/payments/access";
import {
  createReconcileLimiter,
  credentialOwnerMatches,
  parseReturnHint,
  paymentView,
} from "@/lib/payments/checkout-policy";
import { reconcilePayment } from "@/lib/payments/checkout-service";
import { paymentRuntime } from "@/lib/payments/mercadopago";

export const metadata: Metadata = {
  title: "Pedido",
  description: "Resumen de un pedido de la pieza digital.",
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
        <Suspense fallback={<p className="text-sm text-muted">Cargando el pedido…</p>}>
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
        console.error("payment reconcile failed", result.error);
      } else {
        order = (await findOrder(publicId)) ?? order;
      }
    } catch (error) {
      console.error("payment reconcile failed", error instanceof Error ? error.name : "unknown");
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

  return (
    <OrderSummary
      order={order}
      sandboxReady={paymentsReady}
      downloads={downloads}
      view={paymentView({
        orderStatus: order.status,
        hint,
        externalStatus: order.externalPaymentStatus,
      })}
    />
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function paymentHint(value: string | undefined): string | null {
  return value && /^\d{1,32}$/.test(value) ? value : null;
}
