export function isDatabaseUnavailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === "P1001" || code === "P1000" || code === "P1017";
}
