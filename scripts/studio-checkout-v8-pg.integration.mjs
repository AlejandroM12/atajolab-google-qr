/**
 * Local Postgres + mock Mercado Pago: Studio v8 prepare → PENDING → checkout → PAID → delivery.
 * Refuses non-local DATABASE_URL. Deletes fixtures at the end. No real MP charges.
 */
import assert from "node:assert/strict";
import sharp from "sharp";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost)(:\d+)?\//i.test(databaseUrl)) {
  throw new Error("studio-checkout-v8-pg.integration refuses non-local DATABASE_URL");
}

const { prisma } = await import("../lib/db.ts");
const { parseOrderDraft } = await import("../lib/order-draft.ts");
const { findOrder, findPaymentRecord, savePendingOrder, savePreferenceId, applyVerifiedPayment } =
  await import("../lib/orders.ts");
const { PIECE_PRICE_ARS } = await import("../lib/pricing.ts");
const {
  deliveryKeysMatch,
  digitalDeliveryAllowed,
} = await import("../lib/payments/access.ts");
const { createPreferenceLimiter } = await import("../lib/payments/checkout-policy.ts");
const { startCheckout, reconcilePayment } = await import("../lib/payments/checkout-service.ts");
const { processPaymentNotification } = await import("../lib/payments/webhook-handler.ts");
const { PaymentProviderError } = await import("../lib/payments/gateway.ts");
const {
  createPrismaStudioAssetStore,
  createStudioDraftKey,
  dehydrateStudioDocument,
  hashStudioDraftKey,
  putStudioAssetForDraft,
} = await import("../lib/studio/assets/index.ts");
const { studioCheckoutAllowed } = await import("../lib/studio/checkout-access.ts");
const { updateElement } = await import("../lib/studio/document.ts");
const { createDocument } = await import("../lib/studio/templates.ts");

const INIT_POINT = "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=studio-v8-test";
const REVIEW_URL = "https://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnop";
const ORIGIN = new URL("http://localhost:3001");
const TOKEN = "TEST-studio-checkout-v8";

assert.equal(studioCheckoutAllowed({ STUDIO_CHECKOUT_ENABLED: "" }), false);
assert.equal(studioCheckoutAllowed({ STUDIO_CHECKOUT_ENABLED: "true" }), true);

const assetStore = createPrismaStudioAssetStore(prisma);
const draftKey = createStudioDraftKey();
const draftHash = hashStudioDraftKey(draftKey);
const createdOrderIds = [];
const createdAssetIds = [];

async function pngBytes(seed = 40) {
  return sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: seed, g: 90, b: 80 } },
  })
    .png()
    .toBuffer();
}

function withQr(document, value) {
  const qr = document.elements.find((element) => element.type === "qr");
  assert.ok(qr);
  return updateElement(document, qr.id, { value });
}

function mockGateway(state = { created: 0, failOnce: false }) {
  return {
    state,
    gateway: {
      async createPreference(input) {
        if (state.failOnce) {
          state.failOnce = false;
          throw new PaymentProviderError("simulated");
        }
        assert.equal(typeof input.publicId, "string");
        assert.ok(input.publicId.length > 0);
        state.created += 1;
        return {
          id: `pref-studio-${state.created}`,
          initPoint: INIT_POINT,
          externalReference: input.publicId,
          amount: PIECE_PRICE_ARS,
          currency: "ARS",
        };
      },
      async getPreference(id) {
        if (!id) return null;
        return {
          id,
          initPoint: INIT_POINT,
          externalReference: createdOrderIds[0] ?? "",
          amount: PIECE_PRICE_ARS,
          currency: "ARS",
        };
      },
      async getPayment(id) {
        return {
          id: String(id),
          status: "approved",
          amount: PIECE_PRICE_ARS,
          currency: "ARS",
          externalReference: createdOrderIds[0],
          liveMode: false,
          approvedAt: new Date().toISOString(),
          parties: "verified-test-users",
          collectorId: null,
          accountId: null,
        };
      },
      async findPayments() {
        return [];
      },
    },
  };
}

try {
  const bytes = await pngBytes();
  const put = await putStudioAssetForDraft({ store: assetStore, draftKeyHash: draftHash, bytes });
  assert.equal(put.ok, true);
  createdAssetIds.push(put.asset.id);

  let document = withQr(createDocument("corporativo"), REVIEW_URL);
  document = {
    ...document,
    elements: [
      ...document.elements.filter((element) => element.type !== "image"),
      {
        id: "logo",
        role: null,
        type: "image",
        x: 12,
        y: 40,
        width: 28,
        height: 28,
        rotation: 0,
        src: `data:image/png;base64,${bytes.toString("base64")}`,
        alt: "logo",
      },
    ],
  };

  const dehydrated = await dehydrateStudioDocument({
    document,
    store: assetStore,
    draftKeyHash: draftHash,
  });
  assert.equal(dehydrated.ok, true);
  for (const id of dehydrated.assetIds) {
    if (!createdAssetIds.includes(id)) createdAssetIds.push(id);
  }

  const frozenTitle = dehydrated.document.elements.find((el) => el.type === "text")?.text ?? "";

  const parsed = parseOrderDraft(
    {
      version: 8,
      email: "studio-checkout-v8@example.com",
      document: dehydrated.document,
    },
    { studioDraftKey: draftKey },
  );
  assert.equal(parsed.ok, true);

  const created = await savePendingOrder(parsed.draft);
  createdOrderIds.push(created.publicId);

  const pending = await findOrder(created.publicId);
  assert.equal(pending?.status, "PENDING");
  assert.equal(pending?.amountArs, PIECE_PRICE_ARS);
  assert.equal(pending?.artwork.version, 8);
  assert.equal(pending?.artwork.document.elements.find((el) => el.type === "text")?.text, frozenTitle);

  // Retry / double-submit with same retained assets reuses the PENDING order.
  const replay = await savePendingOrder(parsed.draft);
  assert.equal(replay.publicId, created.publicId);
  assert.notEqual(replay.deliveryKey, created.deliveryKey);

  const deliveryKey = replay.deliveryKey;
  const replayRecord = await findPaymentRecord(created.publicId);
  assert.ok(deliveryKeysMatch(deliveryKey, replayRecord.deliveryKeyHash));
  assert.equal(deliveryKeysMatch(created.deliveryKey, replayRecord.deliveryKeyHash), false);

  const paymentStore = {
    async find(publicId) {
      return findPaymentRecord(publicId);
    },
    async savePreference(publicId, preferenceId) {
      await savePreferenceId(publicId, preferenceId);
    },
    async apply(publicId, verified, checkedAt) {
      await applyVerifiedPayment(publicId, verified, checkedAt);
    },
  };

  const failFirst = mockGateway({ created: 0, failOnce: true });
  const failed = await startCheckout({
    publicId: created.publicId,
    body: {},
    deliveryKey,
    accessToken: TOKEN,
    origin: ORIGIN,
    gateway: failFirst.gateway,
    limiter: createPreferenceLimiter(() => 1_000),
    store: paymentStore,
    environment: "test",
  });
  assert.deepEqual(failed, { ok: false, status: 503, error: "payment-provider" });

  const remote = mockGateway();
  const checkout = await startCheckout({
    publicId: created.publicId,
    body: {},
    deliveryKey,
    accessToken: TOKEN,
    origin: ORIGIN,
    gateway: remote.gateway,
    limiter: createPreferenceLimiter(() => 1_000),
    store: paymentStore,
    environment: "test",
  });
  assert.equal(checkout.ok, true);
  if (checkout.ok) assert.equal(checkout.initPoint, INIT_POINT);

  const idempotent = await startCheckout({
    publicId: created.publicId,
    body: {},
    deliveryKey,
    accessToken: TOKEN,
    origin: ORIGIN,
    gateway: remote.gateway,
    limiter: createPreferenceLimiter(() => 1_000),
    store: paymentStore,
    environment: "test",
  });
  assert.equal(idempotent.ok, true);
  assert.equal(remote.state.created, 1);

  const notified = await processPaymentNotification({
    authentic: true,
    topic: "payment",
    dataId: "9001",
    accessToken: TOKEN,
    gateway: remote.gateway,
    findOrder: paymentStore.find,
    apply: paymentStore.apply,
    environment: "test",
  });
  assert.equal(notified, 200);

  const paid = await findOrder(created.publicId);
  assert.equal(paid?.status, "PAID");
  assert.equal(paid?.artwork.version, 8);
  const paymentRow = await findPaymentRecord(created.publicId);
  assert.equal(paymentRow?.status, "PAID");
  assert.equal(
    digitalDeliveryAllowed({
      downloadsEnabled: true,
      status: paymentRow.status,
      key: deliveryKey,
      storedHash: paymentRow.deliveryKeyHash,
    }),
    true,
  );

  assert.equal(studioCheckoutAllowed({ STUDIO_CHECKOUT_ENABLED: "0" }), false);
  assert.equal(
    digitalDeliveryAllowed({
      downloadsEnabled: true,
      status: "PAID",
      key: deliveryKey,
      storedHash: paymentRow.deliveryKeyHash,
    }),
    true,
  );

  const reconciled = await reconcilePayment({
    publicId: created.publicId,
    body: {},
    deliveryKey,
    accessToken: TOKEN,
    gateway: remote.gateway,
    store: paymentStore,
    environment: "test",
  });
  assert.equal(reconciled.ok, true);

  console.log("studio-checkout-v8-pg.integration ok", {
    publicId: created.publicId,
    amountArs: PIECE_PRICE_ARS,
    preferenceCreates: remote.state.created,
  });
} finally {
  if (createdOrderIds.length > 0) {
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  await prisma.studioAsset.deleteMany({
    where: { OR: [{ id: { in: createdAssetIds } }, { draftKeyHash: draftHash }] },
  });
  await prisma.$disconnect();
}
