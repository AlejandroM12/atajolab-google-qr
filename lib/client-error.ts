/** Browser error reports: fixed shape, short strings, no personal data. */

export type ClientErrorReport = { digest: string; message: string; path: string; boundary: string };

function short(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max) : "";
}

export function parseClientErrorReport(body: unknown): ClientErrorReport | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const path = short(record.path, 200);
  // Paths only, without query strings (they can carry payment ids).
  const cleanPath = path.startsWith("/") ? path.split("?")[0]!.replace(/\/pedido\/[^/]+/, "/pedido/:id") : "";
  return {
    digest: short(record.digest, 64),
    message: short(record.message, 300),
    path: cleanPath,
    boundary: record.boundary === "global" ? "global" : "page",
  };
}

/** Client-side sender used by error boundaries. Best effort, never throws. */
export function reportClientError(error: unknown, boundary: "page" | "global"): void {
  try {
    const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : "";
    const message = error instanceof Error ? error.message : String(error);
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ digest, message, path: window.location.pathname, boundary }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // ignore
  }
}
