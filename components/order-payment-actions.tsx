"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isMercadoPagoCheckoutUrl } from "@/lib/payments/checkout-policy";

const errors: Record<string, string> = {
  "payments-not-configured": "El cobro de prueba no está configurado.",
  "checkout-unauthorized": "Esta sesión no puede iniciar el pago de este pedido.",
  "order-not-pending": "Este pedido ya no está pendiente de pago.",
  "preference-limit": "Esperá unos minutos antes de crear otro enlace de pago.",
  "payment-provider": "Mercado Pago no respondió. Podés intentar de nuevo.",
  "database-unavailable": "La base de datos no está disponible.",
  "unexpected-field": "La solicitud de pago no es válida.",
  "invalid-body": "La solicitud de pago no es válida.",
  "order-failed": "No se pudo preparar el pago.",
  "order-price": "El precio del pedido no coincide con el catálogo.",
  "composition-invalid": "La pieza no entra en la plantilla. Volvé al editor y acortá el texto antes de pagar.",
  "not-found": "No encontramos el pedido.",
};

export function OrderPaymentActions({
  publicId,
  mode,
}: {
  publicId: string;
  mode: "pay" | "verify";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${publicId}/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const payload: unknown = await response.json();
      const code = errorCode(payload);
      if (!response.ok) {
        setError(errors[code] ?? "No se pudo iniciar el pago.");
        return;
      }
      const initPoint =
        typeof payload === "object" &&
        payload !== null &&
        "initPoint" in payload &&
        typeof payload.initPoint === "string"
          ? payload.initPoint
          : "";
      if (!isMercadoPagoCheckoutUrl(initPoint)) {
        setError("La respuesta de pago no es válida.");
        return;
      }
      window.location.assign(initPoint);
    } catch {
      setError("No se pudo iniciar el pago.");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    setError(null);
    const params = new URLSearchParams(window.location.search);
    const hinted = params.get("payment_id") ?? params.get("collection_id");
    const body = hinted && /^\d{1,32}$/.test(hinted) ? { paymentId: hinted } : {};
    try {
      const response = await fetch(`/api/orders/${publicId}/reconcile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const code = errorCode(await response.json());
        setError(errors[code] ?? "No se pudo verificar el pago.");
        return;
      }
      router.refresh();
    } catch {
      setError("No se pudo verificar el pago.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      {mode === "pay" ? (
        <button
          type="button"
          className="inline-flex h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          onClick={pay}
          disabled={busy}
        >
          {busy ? "Preparando el pago…" : "Continuar al pago"}
        </button>
      ) : (
        <button
          type="button"
          className="inline-flex h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          onClick={refresh}
          disabled={busy}
        >
          {busy ? "Consultando el pago…" : "Actualizar estado"}
        </button>
      )}
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function errorCode(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const code = payload.error;
    return typeof code === "string" ? code : "";
  }
  return "";
}
