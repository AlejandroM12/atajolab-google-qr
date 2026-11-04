"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Container } from "@/components/container";
import { reportClientError } from "@/lib/client-error";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    reportClientError(error, "page");
  }, [error]);

  const digest =
    typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;

  return (
    <main>
      <Container className="py-20">
        <h1 className="text-4xl font-semibold">No se pudo mostrar esta pantalla</h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
          Volvé a intentar en unos segundos. Si ya pagaste, tu compra está a salvo: podés recuperar las descargas con tu
          correo.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            Reintentar
          </button>
          <Link
            href="/recuperar"
            className="inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-semibold hover:border-accent"
          >
            Recuperar descargas
          </Link>
        </div>
        {digest ? <p className="mt-6 text-xs text-muted">Código de error: {digest}</p> : null}
      </Container>
    </main>
  );
}
