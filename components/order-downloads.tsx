"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

const FORMATS = [
  { format: "png", label: "PNG", hint: "Imagen para imprimir o compartir" },
  { format: "pdf", label: "PDF", hint: "Para imprenta o impresora" },
  { format: "svg", label: "SVG", hint: "Vectorial, para diseñadores" },
] as const;

/** Download buttons for a paid order. Fires `payment_confirmed` once per browser session. */
export function OrderDownloads({ publicId }: { publicId: string }) {
  useEffect(() => {
    try {
      const key = `atajolab:paid:${publicId}`;
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Storage can be blocked; analytics stays best effort.
    }
    trackEvent("payment_confirmed");
  }, [publicId]);

  return (
    <div className="mt-4">
      <p className="text-sm font-semibold">Descargar mis archivos</p>
      <ul className="mt-3 flex flex-wrap gap-3">
        {FORMATS.map((item) => (
          <li key={item.format}>
            <a
              href={`/api/orders/${publicId}/files/${item.format}`}
              aria-label={`Descargar ${item.label}: ${item.hint}`}
              title={item.hint}
              onClick={() => trackEvent("download_clicked", { format: item.format })}
              className="inline-flex h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-5 text-muted">
        PDF para imprenta, PNG para imprimir en casa o compartir, SVG si un diseñador lo va a editar.
      </p>
    </div>
  );
}
