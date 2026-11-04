/**
 * Request body readers that stop at a byte cap while streaming.
 * `request.text()` / `arrayBuffer()` buffer the whole body first, so a
 * chunked request without Content-Length could push anything into memory.
 */

export class BodyTooLargeError extends Error {
  constructor() {
    super("body-too-large");
    this.name = "BodyTooLargeError";
  }
}

export function declaredLengthTooLarge(request: Request, maxBytes: number): boolean {
  const raw = request.headers.get("content-length");
  if (!raw) return false;
  const length = Number(raw);
  return !Number.isFinite(length) || length < 0 || length > maxBytes;
}

export async function readBodyBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (declaredLengthTooLarge(request, maxBytes)) throw new BodyTooLargeError();
  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function readBodyText(request: Request, maxBytes: number): Promise<string> {
  return new TextDecoder("utf-8", { fatal: false }).decode(await readBodyBytes(request, maxBytes));
}

/**
 * JSON body with content-type and size checks. Returns `undefined` for any
 * problem so routes can answer a uniform 400.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) return undefined;
  let raw: string;
  try {
    raw = await readBodyText(request, maxBytes);
  } catch {
    return undefined;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}
