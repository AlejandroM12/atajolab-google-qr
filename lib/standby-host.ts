/**
 * Render is a cold standby since the move to the Hetzner VPS: it keeps its database access and can still
 * answer if someone calls its own onrender.com address, but it must not take new commercial operations
 * while Hetzner is the one in service (two environments creating orders and payments would split the
 * work and the logs).
 *
 * Render sets RENDER=true at runtime; the VPS does not. On Render everything commercial is closed
 * unless RENDER_ACTIVE=true is set deliberately, which is the switch for rolling traffic back to it.
 * Reading downloads, order pages, the payment webhook and reconciliation are not affected.
 */
export function standbyHost(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.RENDER !== "true") return false;
  const active = (env.RENDER_ACTIVE ?? "").trim().toLowerCase();
  return !(active === "1" || active === "true" || active === "yes" || active === "on");
}
