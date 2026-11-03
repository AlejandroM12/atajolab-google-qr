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
    console.error("studio asset upload failed", error instanceof Error ? error.name : "unknown");
    return jsonError(500, "upload-failed");
  }
}

async function readUploadBytes(
  request: Request,
): Promise<{ ok: true; value: Buffer } | { ok: false; status: number; error: string }> {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > STUDIO_ASSET_MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, error: "too-large" };
  }

  if (contentType.startsWith("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
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

  if (
    contentType.startsWith("image/") ||
    contentType === "application/octet-stream"
  ) {
    const buffer = Buffer.from(await request.arrayBuffer());
    if (buffer.length === 0) return { ok: false, status: 400, error: "empty" };
    if (buffer.length > STUDIO_ASSET_MAX_SOURCE_BYTES) {
      return { ok: false, status: 413, error: "too-large" };
    }
    return { ok: true, value: buffer };
  }

  return { ok: false, status: 400, error: "invalid-body" };
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
