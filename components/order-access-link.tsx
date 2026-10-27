"use client";

import { useState } from "react";

const errors: Record<string, string> = {
  "access-unavailable": "Esta sesión no puede generar un enlace para este pedido.",
  "link-limit": "Ya hay enlaces vigentes. Esperá a que venzan o usá uno de ellos.",
  "database-unavailable": "La base de datos no está disponible.",
  "invalid-body": "No se pudo generar el enlace.",
  "not-found": "No encontramos el pedido.",
};

export function OrderAccessLink({ publicId }: { publicId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function createLink() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const response = await fetch(`/api/orders/${publicId}/access-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const code = errorCode(payload);
        setError(errors[code] ?? "No se pudo generar el enlace.");
        return;
      }
      if (!isLink(payload)) {
        setError("No se pudo generar el enlace.");
        return;
      }
      setLink(payload);
    } catch {
      setError("No se pudo generar el enlace.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const expires = link ? formatExpiry(link.expiresAt) : "";

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => void createLink()}
        disabled={busy}
        className="inline-flex h-11 items-center justify-center rounded-full border border-line bg-card px-5 text-sm font-semibold transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Generando el enlace…" : "Generar enlace de acceso"}
      </button>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        El enlace abre las descargas en otro navegador. Vence en 30 minutos y funciona una sola vez.
      </p>
      {link ? (
        <div className="mt-3">
          <label htmlFor="enlace-acceso" className="text-sm font-semibold">
            Enlace privado{expires ? `, vigente hasta ${expires}` : ""}
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="enlace-acceso"
              readOnly
              value={link.url}
              className="h-11 w-full rounded-xl border border-line bg-background px-3 text-sm"
            />
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-strong"
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function isLink(payload: unknown): payload is { url: string; expiresAt: string } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "url" in payload &&
    "expiresAt" in payload &&
    typeof payload.url === "string" &&
    payload.url.startsWith("http") &&
    typeof payload.expiresAt === "string"
  );
}

function errorCode(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  return "";
}

function formatExpiry(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(date);
}
