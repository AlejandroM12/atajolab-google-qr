"use client";

import { useEffect } from "react";
import { Container } from "@/components/container";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main>
      <Container className="py-20">
        <h1 className="text-4xl font-semibold">No se pudo mostrar esta pantalla</h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
          Volvé a intentar. Si el problema sigue, recargá la página.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-8 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-strong"
        >
          Reintentar
        </button>
      </Container>
    </main>
  );
}
