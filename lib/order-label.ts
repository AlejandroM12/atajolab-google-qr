/**
 * Human label for emails/recovery from stored Order.artwork JSON.
 * v1–v7 use businessName; Studio commercial v8 uses title.
 * Never exposes asset ids, draft keys, or secrets.
 */
export function orderArtworkLabel(artwork: unknown): string {
  if (typeof artwork !== "object" || artwork === null || Array.isArray(artwork)) {
    return "Tu diseño";
  }
  const record = artwork as Record<string, unknown>;
  const raw =
    typeof record.title === "string"
      ? record.title
      : typeof record.businessName === "string"
        ? record.businessName
        : "";
  const label = raw.replace(/[\r\n]/g, " ").trim();
  return label.length > 0 ? label.slice(0, 80) : "Tu diseño";
}
