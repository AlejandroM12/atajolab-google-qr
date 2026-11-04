/**
 * Internal Studio export is opt-in in production.
 * Local/dev stays open so /crear export preview works without extra config.
 * Before a public launch: set STUDIO_EXPORT_ENABLED=false (or omit it in
 * production) and gate behind auth or a private preview flag.
 */
export function studioExportAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.STUDIO_EXPORT_ENABLED ?? "").trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes" || flag === "on") return true;
  if (flag === "0" || flag === "false" || flag === "no" || flag === "off") return false;
  return env.NODE_ENV !== "production";
}
