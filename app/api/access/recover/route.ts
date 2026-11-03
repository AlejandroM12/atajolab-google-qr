import { isDatabaseUnavailable } from "@/lib/db-error";
import { createMailSender } from "@/lib/mail";
import {
  countActiveAccessLinks,
  findRecoveryCandidates,
  revokeAccessLinks,
  saveAccessLink,
} from "@/lib/orders";
import { appOrigin } from "@/lib/payments/checkout-policy";
import {
  createRecoveryLimiter,
  parseRecoveryBody,
  recoveryAcknowledgement,
  recoveryClientKeyFromRequest,
  requestRecovery,
} from "@/lib/recovery";

const limiter = createRecoveryLimiter();

export async function POST(request: Request) {
  const body = await readBody(request);
  if (body === undefined) return recoveryError(400, "invalid-body");
  const parsed = parseRecoveryBody(body);
  if (!parsed.ok) return recoveryError(400, parsed.error);

  const origin = appOrigin(process.env.APP_URL);
  try {
    await requestRecovery({
      email: parsed.email,
      now: new Date(),
      origin: origin?.href ?? "",
      limited: !limiter.allow(recoveryClientKeyFromRequest(request), parsed.email),
      store: {
        findOrders: findRecoveryCandidates,
        countActiveLinks: countActiveAccessLinks,
        saveLink: saveAccessLink,
        revoke: revokeAccessLinks,
      },
      sender: createMailSender(),
    });
    return Response.json(recoveryAcknowledgement(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("access recovery failed", error instanceof Error ? error.name : "unknown");
    if (isDatabaseUnavailable(error)) return recoveryError(503, "database-unavailable");
    return recoveryError(500, "recovery-failed");
  }
}

async function readBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) return undefined;
  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return undefined;
  }
  if (raw.length > 2000) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function recoveryError(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}
