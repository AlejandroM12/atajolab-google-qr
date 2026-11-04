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
          <h2 className="text-sm font-semibold">Inspiración</h2>
          <p className="mt-1 text-sm text-muted">Elegí un diseño y personalizalo a tu gusto.</p>
        </div>
        {onClose ? (
          <button type="button" className="shrink-0 text-sm font-semibold text-muted hover:text-foreground" onClick={onClose}>
            Cerrar
          </button>
        ) : null}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {inspirationDesigns.map((item) => (
          <li key={item.id}>
            <button type="button" className={cardButton} onClick={() => onPick(item.id)}>
              <div
                className="w-full rounded-xl bg-background p-1"
                style={{ aspectRatio: "105 / 148" }}
                aria-hidden="true"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- prebuilt same-origin WebP (app/previews), already sized */}
                <img
                  src={previews[item.id] ?? ""}
                  alt=""
                  width={600}
                  height={846}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full rounded-lg object-contain"
                />
              </div>
              <span className="mt-3 text-sm font-semibold leading-snug">{item.name}</span>
              <span className="mt-1 text-xs leading-5 text-muted">{item.description}</span>
              <span className="mt-3 text-sm font-semibold text-accent">Usar este diseño</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
