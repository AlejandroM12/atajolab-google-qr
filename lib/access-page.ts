/**
 * Interstitial for one-time access links.
 *
 * Mail security scanners (Outlook Safe Links, Gmail, antivirus) open links
 * with GET before the buyer does. Redeeming on GET would burn the link, so
 * GET only shows this page and the buyer confirms with a same-origin POST.
 */

import { ACCESS_TOKEN_PATTERN } from "@/lib/access-link";

export function isAccessTokenShape(value: string): boolean {
  return ACCESS_TOKEN_PATTERN.test(value);
}

export function accessConfirmationPage(token: string): string {
  if (!isAccessTokenShape(token)) throw new Error("access-token-shape");
  const action = `/acceso/${token}`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Abrir tu pedido · AtajoLab</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f3ee; color: #1d1a16;
    font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 24px; box-sizing: border-box; }
  main { max-width: 420px; width: 100%; background: #fff; border: 1px solid #e4ddd2; border-radius: 16px; padding: 28px; }
  h1 { font-size: 1.35rem; margin: 0 0 8px; }
  p { margin: 0 0 20px; color: #5b544b; }
  button { width: 100%; min-height: 48px; border: 0; border-radius: 999px; background: #1f5f4a; color: #fff;
    font: inherit; font-weight: 600; cursor: pointer; }
  button:focus-visible { outline: 3px solid #1d1a16; outline-offset: 3px; }
  small { display: block; margin-top: 16px; color: #6b645a; }
</style>
</head>
<body>
<main>
  <h1>Abrir tu pedido</h1>
  <p>Este enlace es personal y se puede usar una sola vez. Tocá el botón para entrar a tu pedido y descargar tus archivos en este navegador.</p>
  <form method="post" action="${action}">
    <button type="submit">Abrir mi pedido</button>
  </form>
  <small>Si no pediste este acceso, cerrá esta página.</small>
</main>
</body>
</html>`;
}
