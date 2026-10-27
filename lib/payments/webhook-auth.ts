import {
  InvalidWebhookSignatureError,
  WebhookSignatureValidator,
} from "mercadopago";

export function notificationIsAuthentic(input: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret: string | undefined;
  now?: () => number;
}): boolean {
  const secret = input.secret?.trim() ?? "";

  if (!secret || !input.xSignature || !input.xRequestId) {
    return false;
  }

  try {
    WebhookSignatureValidator.validate({
      xSignature: input.xSignature,
      xRequestId: input.xRequestId,
      dataId: input.dataId,
      secret,
      toleranceSeconds: 300,
      now: input.now,
    });
    return true;
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError || error instanceof RangeError) {
      return false;
    }

    throw error;
  }
}
