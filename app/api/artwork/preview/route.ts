import { parseArtworkPreview } from "@/lib/order-draft";
import { renderArtworkSvg } from "@/lib/print/preview";

const MAX_BODY_CHARS = 320_000;

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return previewError(400, "invalid-body");
  }

  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return previewError(400, "invalid-body");
  }
  if (raw.length > MAX_BODY_CHARS) return previewError(400, "invalid-body");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return previewError(400, "invalid-body");
  }

  const parsed = parseArtworkPreview(body);
  if (!parsed.ok) return previewError(400, parsed.error);

  try {
    return Response.json(
      { svg: renderArtworkSvg(parsed.artwork) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return previewError(400, "composition");
  }
}

function previewError(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}
