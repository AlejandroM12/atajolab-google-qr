/**
 * Structured server logs. One JSON line per event, readable in Render logs.
 *
 * - Never pass raw emails, tokens, cookies or request bodies as fields.
 * - Error messages and stacks are scrubbed (emails, long tokens) and truncated.
 * - `ALERT_WEBHOOK_URL` (optional, https) receives `error` events as a short
 *   text message (Slack/Discord compatible). At most one alert per event name
 *   per 5 minutes per process.
 */

export type LogLevel = "info" | "warn" | "error";
export type LogFields = Record<string, string | number | boolean | null | undefined>;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;
const BEARER = /(bearer\s+)[^\s"']+/gi;
const MP_TOKEN = /\b(APP_USR|TEST)-[A-Za-z0-9-]+/g;
const ALERT_INTERVAL_MS = 5 * 60_000;
const lastAlert = new Map<string, number>();

export function scrub(value: string, max = 400): string {
  const clean = value
    .replace(EMAIL, "[email]")
    .replace(BEARER, "$1[secret]")
    .replace(MP_TOKEN, "[mp-token]")
    .replace(LONG_TOKEN, "[token]");
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export function describeError(error: unknown): { errorName: string; errorMessage: string; errorCode?: string; stack?: string } {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    // Prisma messages can embed the full query arguments (order data, hashes).
    // Keep only the first meaningful line and rely on the error code.
    const message = error.name.startsWith("PrismaClient")
      ? (error.message.split("\n").find((line) => line.trim().length > 0) ?? "").slice(0, 160)
      : error.message;
    return {
      errorName: error.name,
      errorMessage: scrub(message),
      ...(typeof code === "string" ? { errorCode: code } : {}),
      ...(error.stack ? { stack: scrub(error.stack.split("\n").slice(0, 6).join(" | "), 900) } : {}),
    };
  }
  return { errorName: "unknown", errorMessage: scrub(String(error)) };
}

function write(level: LogLevel, event: string, fields: Record<string, unknown>): void {
  if (process.env.LOG_SILENT === "1") return;
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logInfo(event: string, fields: LogFields = {}): void {
  write("info", event, fields);
}

export function logWarn(event: string, fields: LogFields = {}): void {
  write("warn", event, fields);
}

export function logError(event: string, error?: unknown, fields: LogFields = {}): void {
  const details = error === undefined ? null : describeError(error);
  write("error", event, { ...fields, ...details });
  void sendAlert(event, details?.errorName);
}

async function sendAlert(event: string, errorName: string | undefined): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL?.trim();
  if (!url || !url.startsWith("https://") || process.env.LOG_SILENT === "1") return;
  const now = Date.now();
  const previous = lastAlert.get(event) ?? 0;
  if (now - previous < ALERT_INTERVAL_MS) return;
  lastAlert.set(event, now);
  const text = `AtajoLab error: ${event}${errorName ? ` (${errorName})` : ""}`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Slack reads `text`, Discord reads `content`.
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Alerts are best effort.
  }
}
