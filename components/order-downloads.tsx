"use client";

import { useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";

const FORMATS = [
  {
    format: "png",
    label: "PNG",
    title: "Imagen para imprimir o compartir",
    hint: "Ideal para imprimir en casa, WhatsApp o redes.",
    primary: true,
  },
  {
    format: "pdf",
    label: "PDF",
    title: "Listo para la imprenta",
    hint: "El tamaño exacto del diseño, para imprimir en cualquier lado.",
    primary: false,
  },
  {
    format: "svg",
    label: "SVG",
    title: "Vectorial para diseñadores",
    hint: "Se puede ampliar sin perder calidad ni editar.",
    primary: false,
  },
] as const;

type Format = (typeof FORMATS)[number]["format"];

type DownloadState =
  | { kind: "idle" }
  | { kind: "preparing"; format: Format }
  | { kind: "done"; format: Format }
  | { kind: "error"; format: Format; message: string };

/** What each failed answer means for the person, in plain words. */
function failureMessage(status: number | null): string {
  if (status === null) return "No pudimos conectarnos. Revisá tu conexión y probá de nuevo.";
  if (status === 403 || status === 404) {
    return "Este navegador no tiene acceso a los archivos. Abrí esta página donde hiciste el pedido o recuperalos con tu correo.";
  }
  if (status === 429) return "Pediste varias descargas seguidas. Esperá un minuto y probá de nuevo.";
  return "No pudimos preparar el archivo. Probá de nuevo en unos segundos.";
}

function filenameFrom(header: string | null, fallback: string): string {
  const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(header ?? "");
  if (!match) return fallback;
  try {
    return decodeURIComponent(match[1] ?? match[2] ?? fallback);
  } catch {
    return fallback;
  }
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-5 animate-spin rounded-full border-[3px] border-current border-t-transparent motion-reduce:animate-none"
    />
  );
}

/**
 * The three files of a paid order as large actions. The files are rendered on request, which takes a
 * few seconds: each button says when it is preparing and what went wrong if it fails. The link stays a
 * real link, so a long-press or "open in new tab" still works. Fires `payment_confirmed` once per session.
 */
export function OrderDownloads({ publicId }: { publicId: string }) {
  const [state, setState] = useState<DownloadState>({ kind: "idle" });
  const busy = useRef(false);

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

  async function download(format: Format) {
    if (busy.current) return;
    busy.current = true;
    setState({ kind: "preparing", format });
    trackEvent("download_clicked", { format });
    try {
      const response = await fetch(`/api/orders/${publicId}/files/${format}`, { credentials: "same-origin" });
      if (!response.ok) {
        setState({ kind: "error", format, message: failureMessage(response.status) });
        return;
      }
      const blob = await response.blob();
      const filename = filenameFrom(response.headers.get("content-disposition"), `atajolab-qr.${format}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setState({ kind: "done", format });
    } catch {
      setState({ kind: "error", format, message: failureMessage(null) });
    } finally {
      busy.current = false;
    }
  }

  const active = state.kind === "idle" ? null : state.format;

  return (
    <div data-testid="descargas">
      <ul className="grid gap-3">
        {FORMATS.map((item) => {
          const preparing = state.kind === "preparing" && state.format === item.format;
          const done = state.kind === "done" && state.format === item.format;
          const tone = item.primary
            ? "bg-accent text-white shadow-[0_10px_24px_rgba(15,110,98,0.25)] hover:bg-accent-strong"
            : "border-2 border-accent/30 bg-card text-foreground hover:border-accent";
          const chip = item.primary ? "bg-white/20 text-white" : "bg-ok-bg text-accent-strong";
          const sub = item.primary ? "text-white/85" : "text-muted";
          return (
            <li key={item.format}>
              <a
                href={`/api/orders/${publicId}/files/${item.format}`}
                download
                aria-busy={preparing}
                aria-label={`Descargar ${item.label}: ${item.title}`}
                data-format={item.format}
                onClick={(event) => {
                  event.preventDefault();
                  void download(item.format);
                }}
                className={`flex min-h-[4.75rem] items-center gap-4 rounded-2xl px-4 py-3.5 transition-colors sm:px-5 ${tone} ${
                  state.kind === "preparing" && !preparing ? "pointer-events-none opacity-60" : ""
                }`}
              >
                <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold tracking-wide ${chip}`}>
                  {item.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold leading-snug">
                    {preparing ? `Preparando tu ${item.label}…` : done ? `${item.label} descargado` : `Descargar ${item.label}`}
                  </span>
                  <span className={`mt-0.5 block text-sm leading-5 ${sub}`}>
                    {preparing ? "Puede tardar unos segundos." : done ? "Si no lo ves, revisá tus descargas." : item.hint}
                  </span>
                </span>
                <span className="shrink-0" aria-hidden="true">
                  {preparing ? <Spinner /> : <DownloadIcon />}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      <div role="status" aria-live="polite" className="min-h-0">
        {state.kind === "error" ? (
          <p className="mt-3 rounded-2xl border border-danger/30 bg-danger-bg px-4 py-3 text-sm leading-6 text-danger" role="alert">
            {state.message}
          </p>
        ) : active === null ? null : (
          <span className="sr-only">
            {state.kind === "preparing" ? "Preparando el archivo" : "Descarga lista"}
          </span>
        )}
      </div>
    </div>
  );
}

/** The same three files, shown but not available yet: the payment is not confirmed. */
export function LockedDownloads({ waiting }: { waiting: boolean }) {
  return (
    <ul className="grid gap-3" aria-label="Archivos que se habilitan al confirmarse el pago">
      {FORMATS.map((item) => (
        <li
          key={item.format}
          className="flex min-h-[4.75rem] items-center gap-4 rounded-2xl border border-line bg-card/70 px-4 py-3.5 sm:px-5"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-line/60 text-sm font-bold tracking-wide text-muted">
            {item.label}
          </span>
          <span className="min-w-0 flex-1">
            {waiting ? (
              <>
                <span className="block h-4 w-2/3 animate-pulse rounded bg-line/70 motion-reduce:animate-none" />
                <span className="mt-2 block h-3 w-full max-w-[14rem] animate-pulse rounded bg-line/50 motion-reduce:animate-none" />
              </>
            ) : (
              <>
                <span className="block text-base font-semibold leading-snug text-muted">{item.label}</span>
                <span className="mt-0.5 block text-sm leading-5 text-muted">{item.title}</span>
              </>
            )}
          </span>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </li>
      ))}
    </ul>
  );
}
