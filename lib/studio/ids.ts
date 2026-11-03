export type IdFactory = (prefix: string) => string;

export function createId(prefix: string): string {
  const uuid = globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  return `${prefix}-${uuid}`;
}
