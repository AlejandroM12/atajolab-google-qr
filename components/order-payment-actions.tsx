"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { isMercadoPagoCheckoutUrl } from "@/lib/payments/checkout-policy";

/** Buyer-facing messages. Internal causes go to server logs, not here. */
const errors: Record<string, string> = {
  "payments-not-configured": "Por ahora no podemos tomar pagos en línea. Probá de nuevo en un rato.",
  "checkout-unauthorized":
    "Abrí el pedido desde el navegador donde lo creaste, o recuperá el acceso con tu correo.",
  "order-not-pending": "Este pedido ya no está pendiente de pago. Actualizá la página.",
  "preference-limit": "Esperá unos minutos antes de volver a intentar el pago.",
  "rate-limited": "Hiciste varios intentos seguidos. Esperá unos minutos y volvé a probar.",
  "payment-provider": "Mercado Pago no respondió. Podés intentar de nuevo.",
  "database-unavailable": "Tuvimos un problema momentáneo. Intentá de nuevo en unos minutos.",
  "unexpected-field": "No pudimos iniciar el pago. Actualizá la página e intentá de nuevo.",
  "invalid-body": "No pudimos iniciar el pago. Actualizá la página e intentá de nuevo.",
  "origin-rejected": "No pudimos iniciar el pago. Actualizá la página e intentá de nuevo.",
  "order-failed": "No pudimos preparar el pago. Intentá de nuevo en unos minutos.",
  "order-price": "El precio de este pedido cambió. Creá el pedido de nuevo desde el editor.",
  "composition-invalid": "El texto no entra en el diseño. Volvé al editor y acortalo antes de pagar.",
  "checkout-unavailable": "Por ahora no podemos tomar pagos en línea. Probá de nuevo en un rato.",
  "studio-checkout-disabled": "Por ahora no podemos tomar pagos en línea. Probá de nuevo en un rato.",
  "not-found": "No encontramos el pedido.",
};

/** Seconds between automatic checks while a payment is being verified. */
const POLL_DELAYS_S = [5, 10, 20, 40, 60, 90];

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
  const [polling, setPolling] = useState(mode === "verify");
  const stopped = useRef(false);

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
        setError("No pudimos abrir Mercado Pago. Intentá de nuevo.");
        return;
      }
      trackEvent("checkout_started");
      window.location.assign(initPoint);
    } catch {
      setError("No se pudo iniciar el pago. Revisá tu conexión e intentá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  /** Returns true when the order is no longer pending (page refreshed). */
  const check = useCallback(
    async (manual: boolean): Promise<boolean> => {
      if (manual) {
        setBusy(true);
        setError(null);
      }
      const params = new URLSearchParams(window.location.search);
      const hinted = params.get("payment_id") ?? params.get("collection_id");
      const body = hinted && /^\d{1,32}$/.test(hinted) ? { paymentId: hinted } : {};
      try {
        const response = await fetch(`/api/orders/${publicId}/reconcile`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          if (manual) setError(errors[errorCode(payload)] ?? "No se pudo verificar el pago.");
          return response.status === 429;
        }
        const status =
          typeof payload === "object" && payload !== null && "status" in payload ? payload.status : null;
        if (status !== "PENDING") {
          router.refresh();
          return true;
        }
        if (manual) setError("Todavía no recibimos la confirmación. Puede tardar unos minutos.");
        return false;
      } catch {
        if (manual) setError("No se pudo verificar el pago. Revisá tu conexión.");
        return false;
      } finally {
        if (manual) setBusy(false);
      }
    },
    [publicId, router],
  );

  // While verifying, poll a few times with backoff, then leave the manual button.
  useEffect(() => {
    if (mode !== "verify") return;
    stopped.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    const next = () => {
      if (stopped.current || attempt >= POLL_DELAYS_S.length) {
        setPolling(false);
        return;
      }
      timer = setTimeout(async () => {
        if (document.visibilityState === "hidden") {
          next();
          return;
        }
        attempt += 1;
        const done = await check(false);
        if (done) {
          stopped.current = true;
          setPolling(false);
          return;
        }
        next();
      }, POLL_DELAYS_S[attempt]! * 1000);
    };
    next();
    return () => {
      stopped.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [mode, check]);

  const buttonClass =
    "inline-flex h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="mt-6">
      {mode === "pay" ? (
        <button type="button" className={buttonClass} onClick={pay} disabled={busy}>
          {busy ? "Abriendo Mercado Pago…" : "Pagar con Mercado Pago"}
        </button>
      ) : (
        <>
          {polling ? (
            <p className="mb-3 text-sm text-muted" role="status" aria-live="polite">
              Estamos esperando la confirmación de Mercado Pago. Esta página se actualiza sola.
            </p>
          ) : null}
          <button type="button" className={buttonClass} onClick={() => void check(true)} disabled={busy}>
            {busy ? "Consultando el pago…" : "Actualizar estado"}
          </button>
        </>
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
