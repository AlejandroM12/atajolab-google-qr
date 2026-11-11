"use client";

import { inspirationDesigns, type InspirationId } from "@/lib/studio/inspiration";

const cardButton =
  "flex h-full w-full flex-col items-start rounded-2xl border border-line bg-card p-3 text-left hover:border-accent";

export function InspirationGallery({
  previews,
  onPick,
  onClose,
}: {
  previews: Record<InspirationId, string>;
  onPick: (id: InspirationId) => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Ejemplos</h2>
          <p className="mt-1 text-sm text-muted">Elegí uno y poné tus datos.</p>
        </div>
        {onClose ? (
          <button
            type="button"
            className="inline-flex h-10 shrink-0 items-center rounded-full border border-line bg-card px-4 text-sm font-semibold hover:border-accent"
            onClick={onClose}
          >
            Cerrar
          </button>
        ) : null}
      </div>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {inspirationDesigns.map((item) => (
          <li key={item.id}>
            <button type="button" className={cardButton} onClick={() => onPick(item.id)}>
              <span className="flex aspect-[4/5] w-full items-center justify-center rounded-xl bg-background p-3" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element -- prebuilt same-origin WebP (app/previews) */}
                <img
                  src={previews[item.id] ?? ""}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="max-h-full w-auto max-w-full rounded-md shadow-[0_8px_18px_rgba(20,34,31,0.16)]"
                />
              </span>
              <span className="mt-3 text-sm font-semibold leading-snug">{item.name}</span>
              <span className="mt-0.5 text-xs text-muted">{item.format}</span>
              <span className="mt-3 text-sm font-semibold text-accent">Usar este diseño</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
