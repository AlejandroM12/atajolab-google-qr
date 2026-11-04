import { isDatabaseUnavailable } from "@/lib/db-error";
import { prisma } from "@/lib/db";
import {
  createPrismaStudioAssetStore,
  putStudioAssetForDraft,
  STUDIO_ASSET_MAX_SOURCE_BYTES,
  STUDIO_ASSET_MAX_UPLOAD_BYTES,
} from "@/lib/studio/assets/index";
import { hashStudioDraftKey } from "@/lib/studio/assets/draft-key";
import {
  readStudioDraftKey,
  studioClientKeyFromRequest,
  studioRequestTrusted,
} from "@/lib/studio/draft-session";
import { limitStudioUpload } from "@/lib/studio/rate-limits";
import { BodyTooLargeError, readBodyBytes } from "@/lib/http/body";
import { logError } from "@/lib/log";

/**
 * Private Studio image ingest. Requires the HttpOnly draft cookie.
 * Returns metadata + asset id only — never bytes or a public URL.
 */
export async function POST(request: Request) {
  if (!studioRequestTrusted(request)) {
    return jsonError(403, "origin-rejected");
  }

  const draftKey = readStudioDraftKey(request.headers.get("cookie"));
  if (!draftKey) return jsonError(401, "draft-required");

  const draftKeyHash = hashStudioDraftKey(draftKey);
  const clientKey = studioClientKeyFromRequest(request);

  try {
    const limited = await limitStudioUpload(clientKey, draftKeyHash);
    if (!limited.ok) {
      return jsonError(429, "rate-limited", {
        "retry-after": String(limited.retryAfterSec),
      });
    }

    const bytes = await readUploadBytes(request);
    if (!bytes.ok) return jsonError(bytes.status, bytes.error);

    const store = createPrismaStudioAssetStore(prisma);
    const put = await putStudioAssetForDraft({
      store,
      draftKeyHash,
      bytes: bytes.value,
    });
    if (!put.ok) {
      return jsonError(mapPutStatus(put.error), put.error);
    }

    return Response.json(
      {
        id: put.asset.id,
        width: put.asset.width,
        height: put.asset.height,
        mime: put.asset.mime,
        byteLength: put.asset.byteLength,
        reused: put.reused,
      },
      { status: put.reused ? 200 : 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (isDatabaseUnavailable(error)) return jsonError(503, "database-unavailable");
    logError("studio.asset-upload-failed", error);
    return jsonError(500, "upload-failed");
  }
}

async function readUploadBytes(
  request: Request,
): Promise<{ ok: true; value: Buffer } | { ok: false; status: number; error: string }> {
  const rawContentType = request.headers.get("content-type") ?? "";
  const contentType = rawContentType.toLowerCase();
  const multipart = contentType.startsWith("multipart/form-data");
  const binary = contentType.startsWith("image/") || contentType === "application/octet-stream";
  if (!multipart && !binary) return { ok: false, status: 400, error: "invalid-body" };

  // Stream with a hard cap: chunked bodies without Content-Length cannot exceed it.
  let raw: Uint8Array;
  try {
    raw = await readBodyBytes(request, STUDIO_ASSET_MAX_UPLOAD_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return { ok: false, status: 413, error: "too-large" };
    return { ok: false, status: 400, error: "invalid-body" };
  }

  if (multipart) {
    let form: FormData;
    try {
      form = await new Response(raw as BodyInit, { headers: { "content-type": rawContentType } }).formData();
    } catch {
      return { ok: false, status: 400, error: "invalid-body" };
    }
    const file = form.get("file");
    if (!(file instanceof File)) return { ok: false, status: 400, error: "invalid-body" };
    if (file.size > STUDIO_ASSET_MAX_SOURCE_BYTES) {
      return { ok: false, status: 413, error: "too-large" };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) return { ok: false, status: 400, error: "empty" };
    return { ok: true, value: buffer };
  }

  const buffer = Buffer.from(raw);
  if (buffer.length === 0) return { ok: false, status: 400, error: "empty" };
  if (buffer.length > STUDIO_ASSET_MAX_SOURCE_BYTES) {
    return { ok: false, status: 413, error: "too-large" };
  }
  return { ok: true, value: buffer };
}

function mapPutStatus(error: string): number {
  if (error === "too-large" || error === "draft-bytes") return 413;
  if (error === "draft-quota") return 429;
  if (error === "unsupported-type" || error === "invalid-image" || error === "empty" || error === "dimensions") {
    return 400;
  }
  if (error === "draft-required") return 401;
  return 500;
}

function jsonError(status: number, error: string, extraHeaders?: Record<string, string>) {
  return Response.json(
    { error },
    {
      status,
      headers: { "cache-control": "no-store", ...extraHeaders },
    },
  );
}
