const pulse = "animate-pulse motion-reduce:animate-none bg-line/60";

/** The preview of the design while it is being drawn. */
export function PreviewSkeleton({ label = "Preparando la vista previa de tu diseño…" }: { label?: string }) {
  return (
    <div role="status" className="mx-auto w-full max-w-[16rem] lg:max-w-[20rem]">
      <div className={`aspect-[3/4] w-full rounded-2xl ${pulse}`} />
      <p className="mt-3 text-center text-xs text-muted">{label}</p>
    </div>
  );
}

/** While the order is looked up and, if it is pending, its payment is checked. */
export function OrderSkeleton() {
  return (
    <div className="mx-auto max-w-4xl" role="status" aria-live="polite">
      <span className="sr-only">Buscando tu pedido y comprobando el estado del pago…</span>
      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)]" aria-hidden="true">
        <div className="lg:col-start-1 lg:row-start-1">
          <div className={`h-8 w-40 rounded-full ${pulse}`} />
          <div className={`mt-4 h-10 w-4/5 rounded-xl ${pulse}`} />
          <div className={`mt-3 h-4 w-3/5 rounded ${pulse}`} />
        </div>
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className={`mx-auto aspect-[3/4] w-full max-w-[16rem] rounded-3xl lg:max-w-none ${pulse}`} />
        </div>
        <div className="lg:col-start-1 lg:row-start-2">
          <div className="grid gap-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className={`h-[4.75rem] rounded-2xl ${pulse}`} />
            ))}
          </div>
          <p className="mt-5 text-sm text-muted">Buscando tu pedido y comprobando el estado del pago…</p>
        </div>
      </div>
    </div>
  );
}
