"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-error";

/** Replaces the root layout when it fails: no global CSS here, so styles are inline. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    reportClientError(error, "global");
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f3f0e8",
          color: "#1d1a16",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: 24,
        }}
      >
        <title>AtajoLab · Error</title>
        <main style={{ maxWidth: 480 }}>
          <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>Algo salió mal</h1>
          <p style={{ margin: "0 0 24px", lineHeight: 1.5, color: "#5b544b" }}>
            Volvé a intentar en unos segundos. Si ya pagaste, tu compra está a salvo.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              height: 44,
              padding: "0 20px",
              border: 0,
              borderRadius: 999,
              background: "#1f5f4a",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
