"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { parseBuyerEmail } from "@/lib/buyer-email";

const errors: Record<string, string> = {
  "invalid-email": "Revisá el correo.",
  "invalid-order": "El número de pedido tiene 24 letras y números. Revisalo o dejalo vacío.",
  "reason-too-long": "El motivo puede tener hasta 1000 caracteres.",
  "rate-limited": "Ya recibimos varias solicitudes. Esperá un rato o escribinos por correo.",
  "withdrawal-unavailable": "No pudimos registrar la solicitud. Escribinos por correo desde Contacto.",
};

export function WithdrawalForm({ enabled }: { enabled: boolean }) {
  const [email, setEmail] = useState("");
  const [publicId, setPublicId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!parseBuyerEmail(email)) {
      setError(errors["invalid-email"]!);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/arrepentimiento", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, publicId: publicId.trim(), reason }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const record = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
      if (!response.ok || typeof record.code !== "string") {
        const key = typeof record.error === "string" ? record.error : "";
        setError(errors[key] ?? "No pudimos registrar la solicitud. Intentá de nuevo.");
        return;
      }
      setCode(record.code);
    } catch {
      setError("No pudimos registrar la solicitud. Revisá tu conexión.");
    } finally {
      setBusy(false);
    }
  }

  if (code) {
    return (
      <div role="status" className="rounded-3xl border border-accent/30 bg-ok-bg p-5">
        <p className="text-base font-semibold">Recibimos tu solicitud.</p>
        <p className="mt-2 text-sm leading-6">
          Tu código de solicitud es <strong className="font-mono">{code}</strong>. Guardalo. Te vamos a escribir al
          correo que indicaste para continuar.
        </p>
      </div>
    );
  }

  if (!enabled) {
    return (
      <p className="rounded-2xl bg-warning-bg px-4 py-3 text-sm leading-relaxed text-warning">
        El formulario se habilita cuando esté configurado el correo de atención. Mientras tanto, usá los datos de{" "}
        <Link className="underline" href="/contacto">
          Contacto
        </Link>
        .
      </p>
    );
  }

  const field = "mt-2 w-full rounded-xl border border-line bg-background px-3 text-sm";
  return (
    <form onSubmit={(event) => void submit(event)} className="max-w-xl space-y-4">
      <label className="block text-sm">
        <span className="font-semibold">Correo que usaste en la compra</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={`${field} h-11`}
        />
      </label>
      <label className="block text-sm">
        <span className="font-semibold">Número de pedido (opcional)</span>
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={24}
          value={publicId}
          onChange={(event) => setPublicId(event.target.value)}
          className={`${field} h-11 font-mono`}
        />
        <span className="mt-1 block text-xs text-muted">Está en la página de tu compra y en el correo de acceso.</span>
      </label>
      <label className="block text-sm">
        <span className="font-semibold">Motivo (opcional)</span>
        <textarea
          rows={4}
          maxLength={1000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className={`${field} py-2`}
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="inline-flex h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {busy ? "Enviando…" : "Enviar solicitud de arrepentimiento"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
