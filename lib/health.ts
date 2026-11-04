import { prisma } from "@/lib/db";
import { legalDataComplete, pendingLegalFields } from "@/lib/legal";
import { createMailSender } from "@/lib/mail";
import { credentialShape } from "@/lib/payments/checkout-policy";
import { rateLimitClientKeyFromRequest, readRateLimitTrustProxy } from "@/lib/client-ip";
import { studioCheckoutAllowed, studioSalesOpen } from "@/lib/studio/checkout-access";

const DB_TIMEOUT_MS = 3000;

export type PublicHealth = { status: "ok" | "degraded"; database: "ok" | "unavailable" };

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function databaseReachable(): Promise<boolean> {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, DB_TIMEOUT_MS);
    return true;
  } catch {
    return false;
  }
}

export async function publicHealth(): Promise<PublicHealth> {
  const db = await databaseReachable();
  return { status: db ? "ok" : "degraded", database: db ? "ok" : "unavailable" };
}

/**
 * Operator view: configuration presence (never values) and the signals that
 * need action: failed purchase mails and approved-looking orders still pending.
 */
export async function operatorHealth(request: Request, env: NodeJS.ProcessEnv = process.env) {
  const base = await publicHealth();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  let signals: Record<string, number> | { error: string } = { error: "database-unavailable" };
  if (base.database === "ok") {
    try {
      const [mailFailed, mailPending, stuckApproved, paidLast24h] = await withTimeout(
        Promise.all([
          prisma.mailNotification.count({ where: { status: "FAILED", createdAt: { gte: since } } }),
          prisma.mailNotification.count({
            where: { status: { in: ["PENDING", "PROCESSING"] }, createdAt: { lte: new Date(Date.now() - 15 * 60_000) } },
          }),
          prisma.order.count({ where: { status: "PENDING", mercadoPagoPaymentStatus: "approved" } }),
          prisma.order.count({ where: { status: "PAID", paidAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } } }),
        ]),
        DB_TIMEOUT_MS,
      );
      signals = { mailFailed7d: mailFailed, mailStale15m: mailPending, pendingWithApprovedPayment: stuckApproved, paidLast24h };
    } catch {
      signals = { error: "query-failed" };
    }
  }

  return {
    ...base,
    commit: (env.RENDER_GIT_COMMIT ?? "").slice(0, 12) || null,
    config: {
      paymentsEnvironment: env.MERCADOPAGO_ENV ?? null,
      paymentsCredentialShape: credentialShape(env.MERCADOPAGO_ACCESS_TOKEN, env.MERCADOPAGO_ENV),
      webhookSecretSet: Boolean(env.MERCADOPAGO_WEBHOOK_SECRET?.trim()),
      notificationUrlSet: Boolean(env.MERCADOPAGO_NOTIFICATION_URL?.trim()),
      mailMode: createMailSender(env).mode,
      orderAccessSecretSet: (env.ORDER_ACCESS_SECRET?.trim().length ?? 0) >= 32,
      cleanupSecretSet: (env.STUDIO_CLEANUP_SECRET?.trim().length ?? 0) >= 16,
      studioCheckoutEnabled: studioCheckoutAllowed(env),
      // false while legal data is incomplete in production, even with the flag on.
      studioSalesOpen: studioSalesOpen(env),
      rateLimitTrustProxy: readRateLimitTrustProxy(env),
      alertWebhookSet: Boolean(env.ALERT_WEBHOOK_URL?.trim()),
      analyticsSet: Boolean(env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim()),
      legalDataComplete: legalDataComplete(),
      legalPending: pendingLegalFields(),
    },
    signals,
    // Verify RATE_LIMIT_TRUST_PROXY: call this from two different networks
    // (e.g. Wi-Fi and mobile data). Different keys = per-client limits work.
    rateLimit: {
      clientKey: rateLimitClientKeyFromRequest(request, env),
      forwardedForEntries: (request.headers.get("x-forwarded-for") ?? "").split(",").filter((part) => part.trim()).length,
    },
  };
}
