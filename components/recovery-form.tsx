"use client";

import { useState, type FormEvent } from "react";
import { parseBuyerEmail } from "@/lib/buyer-email";
import { trackEvent } from "@/lib/analytics";

export function RecoveryForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (!parseBuyerEmail(email)) {
      setError("Revisá el correo e intentá de nuevo.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/access/recover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        setError("No pudimos preparar el acceso. Revisá el correo e intentá de nuevo.");
        return;
      }
      setMessage(
        "Listo. Si ese correo tiene compras confirmadas, preparamos el enlace. Esta respuesta no indica si el correo tiene compras.",
      );
      setEmail("");
      trackEvent("recovery_requested");
    } catch {
      setError("No pudimos preparar el acceso. Intentá de nuevo en un momento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-6 max-w-xl">
      <label htmlFor="correo-recuperacion" className="text-sm font-semibold">
        Correo electrónico
      </label>
      <input
        id="correo-recuperacion"
        type="email"
        inputMode="email"
        autoComplete="email"
        spellCheck={false}
        autoCapitalize="none"
        maxLength={254}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        className="mt-2 h-11 w-full rounded-xl border border-line bg-background px-3 text-sm"
      />
      <button
        type="submit"
        disabled={busy}
        className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Preparando…" : "Recuperar mis descargas"}
      </button>
      {message ? (
        <p className="mt-4 text-sm leading-relaxed text-muted" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
