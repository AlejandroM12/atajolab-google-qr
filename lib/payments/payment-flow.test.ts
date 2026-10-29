import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { DIGITAL_DOWNLOADS_ENABLED } from "../delivery.ts";
import { PIECE_PRICE_ARS } from "../pricing.ts";
import {
  createDeliveryKey,
  deliveryKeysMatch,
  digitalDeliveryAllowed,
  hashDeliveryKey,
  orderAccessCookie,
  readOrderAccess,
} from "./access.ts";
import {
  MAX_RECONCILE_PAYMENTS,
  amountsMatch,
  credentialOwnerMatches,
  credentialShape,
  createPreferenceLimiter,
  createReconcileLimiter,
  isMercadoPagoCheckoutUrl,
  parseCheckoutBody,
  paymentView,
  preferenceAutoReturn,
} from "./checkout-policy.ts";
import { reconcilePayment, startCheckout } from "./checkout-service.ts";
import { decidePayment, type VerifiedPayment } from "./decision.ts";
import { classifyAccount, classifyParties } from "./test-accounts.ts";
import { PaymentProviderError, createMercadoPagoGateway, parseMercadoPagoUser, type PaymentGateway } from "./gateway.ts";
import { processPaymentNotification } from "./webhook-handler.ts";
import { notificationIsAuthentic } from "./webhook-auth.ts";
import type { PaymentRecord } from "../orders.ts";

const PUBLIC_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN = "TEST-not-a-real-token";
const ORIGIN = new URL("http://localhost:3001");
const INIT_POINT = "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=test";

function payment(overrides: Partial<VerifiedPayment> = {}): VerifiedPayment {
  return {
    id: "100",
    status: "approved",
    amount: PIECE_PRICE_ARS,
    currency: "ARS",
    externalReference: PUBLIC_ID,
    liveMode: false,
    approvedAt: "2026-10-27T15:00:00.000Z",
    parties: "verified-test-users",
    collectorId: null,
    accountId: null,
    ...overrides,
  };
}

function record(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    publicId: PUBLIC_ID,
    status: "PENDING",
    amountArs: PIECE_PRICE_ARS,
    currency: "ARS",
    preferenceId: null,
    paymentId: null,
    paymentStatus: null,
    deliveryKeyHash: null,
    ...overrides,
  };
}

function memory(initial: PaymentRecord, environment: "test" | "production" = "test") {
  let order = { ...initial };
  let applies = 0;
  return {
    applies: () => applies,
    order: () => order,
    async find() {
      return { ...order };
    },
    async savePreference(_publicId: string, preferenceId: string) {
      order = { ...order, preferenceId };
    },
    async apply(publicId: string, verified: VerifiedPayment, checkedAt: Date) {
      applies += 1;
      const decision = decidePayment(order, verified, checkedAt, environment);
      if (decision.action === "mark-paid") {
        order = { ...order, status: "PAID", paymentId: verified.id, paymentStatus: "approved" };
      } else if (decision.action === "record-external") {
        order = {
          ...order,
          paymentId: verified.id,
          paymentStatus: verified.status,
        };
      }
      assert.equal(publicId, order.publicId);
    },
  };
}

function gateway(overrides: Partial<PaymentGateway> = {}): PaymentGateway & { created: number } {
  const state = { created: 0 };
  const base: PaymentGateway = {
    async createPreference(input) {
      state.created += 1;
      assert.equal(input.publicId, PUBLIC_ID);
      assert.equal("amount" in input, false);
      assert.equal("unit_price" in input, false);
      return {
        id: "pref-1",
        initPoint: INIT_POINT,
        externalReference: input.publicId,
        amount: PIECE_PRICE_ARS,
        currency: "ARS",
      };
    },
    async getPreference() {
      return null;
    },
    async getPayment() {
      return null;
    },
    async findPayments() {
      return [];
    },
  };
  return Object.assign(state, { ...base, ...overrides, created: state.created });
}

function trackingGateway(overrides: Partial<PaymentGateway> = {}) {
  let created = 0;
  const payments = gateway({
    async createPreference(input) {
      created += 1;
      assert.equal("amount" in input, false);
      return {
        id: `pref-${created}`,
        initPoint: INIT_POINT,
        externalReference: input.publicId,
        amount: PIECE_PRICE_ARS,
        currency: "ARS",
      };
    },
    ...overrides,
  });
  return { gateway: payments, created: () => created };
}

const key = createDeliveryKey();
const hash = hashDeliveryKey(key);

assert.equal(amountsMatch(4900, 4900), true);
assert.equal(amountsMatch(4900.0, 4900), true);
assert.equal(amountsMatch(4899.99, 4900), false);
assert.equal(isMercadoPagoCheckoutUrl("https://evilmercadopago.com/pay"), false);
assert.equal(isMercadoPagoCheckoutUrl("https://www.mercadopago.com.ar/checkout"), true);
assert.equal(parseCheckoutBody({ amount: 1, currency: "USD", status: "PAID" }), "unexpected-field");
assert.equal(parseCheckoutBody({}), null);

{
  const store = memory(record({ deliveryKeyHash: hash }));
  const remote = trackingGateway();
  const result = await startCheckout({
    publicId: PUBLIC_ID,
    body: {},
    deliveryKey: key,
    accessToken: TOKEN,
    origin: ORIGIN,
    gateway: remote.gateway,
    limiter: createPreferenceLimiter(() => 1_000),
    store,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.initPoint, INIT_POINT);
    assert.equal(JSON.stringify(result).includes(TOKEN), false);
  }
  assert.equal(remote.created(), 1);
  assert.equal(store.order().preferenceId, "pref-1");
}

{
  const remote = trackingGateway();
  const missing = await startCheckout({
    publicId: "no-existe",
    body: {},
    deliveryKey: key,
    accessToken: TOKEN,
    origin: ORIGIN,
    gateway: remote.gateway,
    limiter: createPreferenceLimiter(() => 1_000),
    store: memory(record()),
  });
  assert.deepEqual(missing, { ok: false, status: 404, error: "not-found" });
  const unknown = await startCheckout({
    publicId: PUBLIC_ID,
    body: {},
    deliveryKey: key,
    accessToken: TOKEN,
    origin: ORIGIN,
    gateway: remote.gateway,
    limiter: createPreferenceLimiter(() => 1_000),
    store: { ...memory(record()), async find() { return null; } },
  });
  assert.deepEqual(unknown, { ok: false, status: 404, error: "not-found" });
  assert.equal(remote.created(), 0);
}

{
  const remote = trackingGateway();
  const result = await startCheckout({
    publicId: PUBLIC_ID,
    body: { amount: 1, currency: "USD", status: "approved", paymentId: "999" },
    deliveryKey: key,
    accessToken: TOKEN,
    origin: ORIGIN,
    gateway: remote.gateway,
    limiter: createPreferenceLimiter(() => 1_000),
    store: memory(record({ deliveryKeyHash: hash })),
  });
  assert.deepEqual(result, { ok: false, status: 400, error: "unexpected-field" });
  assert.equal(remote.created(), 0);
}

{
  const secret = "APP_USR-production-secret";
  const remote = trackingGateway();
  const result = await startCheckout({
    publicId: PUBLIC_ID,
    body: {},
    deliveryKey: key,
    accessToken: secret,
    origin: ORIGIN,
    gateway: remote.gateway,
    limiter: createPreferenceLimiter(() => 1_000),
    store: memory(record({ deliveryKeyHash: hash })),
  });
  assert.deepEqual(result, { ok: false, status: 503, error: "payments-not-configured" });
  assert.equal(remote.created(), 0);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.throws(
    () => createMercadoPagoGateway({
      accessToken: secret,
      notificationUrl: undefined,
      collectorId: "100",
    }),
    (error: unknown) => error instanceof PaymentProviderError && !String(error).includes(secret),
  );
  assert.equal(
    preferenceAutoReturn("http://localhost:3001/pedido/aaaaaaaaaaaaaaaaaaaaaaaa?retorno=aprobado"),
    undefined,
  );
  assert.equal(
    preferenceAutoReturn("https://example.com/pedido/aaaaaaaaaaaaaaaaaaaaaaaa?retorno=aprobado"),
    "approved",
  );
  assert.equal(credentialShape(secret, "test"), "ready");
  assert.equal(credentialShape(secret), "mismatch");
  assert.equal(credentialShape(secret, "production"), "ready");
  assert.equal(credentialShape(TOKEN, "production"), "mismatch");
  const client = readFileSync(new URL("../../components/order-payment-actions.tsx", import.meta.url), "utf8");
  assert.equal(client.includes("MERCADOPAGO_ACCESS_TOKEN"), false);
  assert.equal(client.includes("WEBHOOK_SECRET"), false);
  const gatewaySource = readFileSync(new URL("./gateway.ts", import.meta.url), "utf8");
  assert.match(gatewaySource, /unit_price: PIECE_PRICE_ARS/);
  assert.equal(gatewaySource.includes("sandbox_init_point"), false);
}

{
  const store = memory(record({ deliveryKeyHash: hash, preferenceId: "pref-1" }));
  let created = 0;
  const result = await startCheckout({
    publicId: PUBLIC_ID,
    body: {},
    deliveryKey: key,
    accessToken: TOKEN,
    origin: ORIGIN,
    gateway: gateway({
      async getPreference() {
        return {
          id: "pref-1",
          initPoint: INIT_POINT,
          externalReference: PUBLIC_ID,
          amount: PIECE_PRICE_ARS,
          currency: "ARS",
        };
      },
      async createPreference() {
        created += 1;
        throw new Error("duplicate");
      },
    }),
    limiter: createPreferenceLimiter(() => 1_000),
    store,
  });
  assert.equal(result.ok, true);
  assert.equal(created, 0);
}

{
  const denied = await startCheckout({
    publicId: PUBLIC_ID,
    body: {},
    deliveryKey: createDeliveryKey(),
    accessToken: TOKEN,
    origin: ORIGIN,
    gateway: gateway(),
    limiter: createPreferenceLimiter(() => 1_000),
    store: memory(record({ deliveryKeyHash: hash })),
  });
  assert.deepEqual(denied, { ok: false, status: 403, error: "checkout-unauthorized" });
}

{
  let created = 0;
  const store = memory(record({ deliveryKeyHash: hash }));
  const remote = gateway({
    async createPreference(input) {
      created += 1;
      return {
        id: `pref-${created}`,
        initPoint: INIT_POINT,
        externalReference: input.publicId,
        amount: PIECE_PRICE_ARS,
        currency: "ARS",
      };
    },
    async getPreference() {
      return null;
    },
  });
  const limiter = createPreferenceLimiter(() => 5_000);
  for (let index = 0; index < 3; index += 1) {
    const result = await startCheckout({
      publicId: PUBLIC_ID,
      body: {},
      deliveryKey: key,
      accessToken: TOKEN,
      origin: ORIGIN,
      gateway: remote,
      limiter,
      store,
    });
    assert.equal(result.ok, true);
  }
  const limited = await startCheckout({
    publicId: PUBLIC_ID,
    body: {},
    deliveryKey: key,
    accessToken: TOKEN,
    origin: ORIGIN,
    gateway: remote,
    limiter,
    store,
  });
  assert.deepEqual(limited, { ok: false, status: 429, error: "preference-limit" });
}

const ts = "1704908010";
const dataId = "123456";
const requestId = "req-1";
const webhookSecret = "sandbox-webhook-secret";
const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
const signature = createHmac("sha256", webhookSecret).update(manifest).digest("hex");
assert.equal(
  notificationIsAuthentic({
    xSignature: `ts=${ts},v1=${signature}`,
    xRequestId: requestId,
    dataId,
    secret: webhookSecret,
    now: () => Number(ts) * 1000,
  }),
  true,
);
assert.equal(
  notificationIsAuthentic({
    xSignature: `ts=${ts},v1=${"ab".repeat(32)}`,
    xRequestId: requestId,
    dataId,
    secret: webhookSecret,
    now: () => Number(ts) * 1000,
  }),
  false,
);

async function notify(store: ReturnType<typeof memory>, remote: PaymentGateway, authentic = true) {
  return processPaymentNotification({
    authentic,
    topic: "payment",
    dataId: "100",
    accessToken: TOKEN,
    gateway: remote,
    findOrder: store.find,
    apply: store.apply,
    environment: "test",
    now: new Date("2026-10-27T15:00:00.000Z"),
  });
}

{
  const store = memory(record({ deliveryKeyHash: hash }));
  let lookups = 0;
  const status = await notify(store, gateway({
    async getPayment() {
      lookups += 1;
      return payment({ status: "approved" });
    },
  }), false);
  assert.equal(status, 401);
  assert.equal(lookups, 0);
  assert.equal(store.order().status, "PENDING");
}

for (const status of ["rejected", "pending", "cancelled", "in_process"] as const) {
  const store = memory(record({ deliveryKeyHash: hash }));
  const code = await notify(store, gateway({
    async getPayment() {
      return payment({ status });
    },
  }));
  assert.equal(code, 200);
  assert.equal(store.order().status, "PENDING");
  assert.equal(store.order().paymentStatus, status);
  assert.equal(store.applies() > 0, true);
}

{
  const store = memory(record({ deliveryKeyHash: hash }));
  const code = await notify(store, gateway({
    async getPayment() {
      return payment();
    },
  }));
  assert.equal(code, 200);
  assert.equal(store.order().status, "PAID");
  const duplicate = await notify(store, gateway({
    async getPayment() {
      return payment();
    },
  }));
  assert.equal(duplicate, 200);
  assert.equal(store.order().status, "PAID");
  assert.equal(store.applies(), 1);
}

{
  const store = memory(record({ deliveryKeyHash: hash }));
  const code = await notify(store, gateway({
    async getPayment() {
      return payment({ amount: 1 });
    },
  }));
  assert.equal(code, 200);
  assert.equal(store.applies(), 0);
  assert.equal(store.order().status, "PENDING");
}

{
  const store = memory(record({ deliveryKeyHash: hash }));
  const code = await notify(store, gateway({
    async getPayment() {
      return payment({ currency: "BRL" });
    },
  }));
  assert.equal(code, 200);
  assert.equal(store.applies(), 0);
  assert.equal(store.order().status, "PENDING");
}

{
  const store = memory(record({ deliveryKeyHash: hash }));
  const code = await notify(store, gateway({
    async getPayment() {
      return payment({ externalReference: "bbbbbbbbbbbbbbbbbbbbbbbb" });
    },
  }));
  assert.equal(code, 200);
  assert.equal(store.applies(), 0);
  assert.equal(store.order().status, "PENDING");
}

{
  const store = memory(record({ deliveryKeyHash: hash }));
  const code = await notify(store, gateway({
    async getPayment() {
      return payment({ liveMode: true, parties: "verified-real" });
    },
  }));
  assert.equal(code, 200);
  assert.equal(store.applies(), 0);
  assert.equal(store.order().status, "PENDING");
}

{
  const store = memory(record({ deliveryKeyHash: hash, status: "PAID" }));
  const code = await notify(store, gateway({
    async getPayment() {
      return payment({ status: "rejected", id: "200" });
    },
  }));
  assert.equal(code, 200);
  assert.equal(store.order().status, "PAID");
  assert.equal(store.applies(), 0);
}

{
  const store = memory(record({ deliveryKeyHash: hash }));
  let attempts = 0;
  const remote = gateway({
    async getPayment() {
      attempts += 1;
      if (attempts === 1) throw new Error("timeout");
      return payment();
    },
  });
  assert.equal(await notify(store, remote), 500);
  assert.equal(store.order().status, "PENDING");
  assert.equal(await notify(store, remote), 200);
  assert.equal(store.order().status, "PAID");
}

{
  assert.equal(
    paymentView({ orderStatus: "PENDING", hint: "aprobado", externalStatus: null }),
    "verifying",
  );
  assert.equal(
    paymentView({ orderStatus: "PAID", hint: "rechazado", externalStatus: "rejected" }),
    "approved",
  );
  const store = memory(record({ deliveryKeyHash: hash }));
  const returned = await reconcilePayment({
    publicId: PUBLIC_ID,
    body: { status: "approved", payment_status: "approved" },
    deliveryKey: key,
    accessToken: TOKEN,
    gateway: gateway(),
    store,
  });
  assert.deepEqual(returned, { ok: false, status: 400, error: "unexpected-field" });
  const empty = await reconcilePayment({
    publicId: PUBLIC_ID,
    body: {},
    deliveryKey: key,
    accessToken: TOKEN,
    gateway: gateway(),
    store,
  });
  assert.deepEqual(empty, { ok: true, status: "PENDING" });
  assert.equal(store.order().status, "PENDING");
}

{
  const store = memory(record({ deliveryKeyHash: hash }));
  const forged = await reconcilePayment({
    publicId: PUBLIC_ID,
    body: { status: "PAID", amount: 0 },
    deliveryKey: key,
    accessToken: TOKEN,
    gateway: gateway({
      async getPayment() {
        return payment();
      },
    }),
    store,
  });
  assert.equal(forged.ok, false);
  assert.equal(store.order().status, "PENDING");
  assert.equal(DIGITAL_DOWNLOADS_ENABLED, true);
  assert.equal(
    digitalDeliveryAllowed({
      downloadsEnabled: true,
      status: "PENDING",
      key,
      storedHash: hash,
    }),
    false,
  );
  assert.equal(
    digitalDeliveryAllowed({
      downloadsEnabled: true,
      status: "PAID",
      key: null,
      storedHash: hash,
    }),
    false,
  );
  assert.equal(
    digitalDeliveryAllowed({
      downloadsEnabled: true,
      status: "PAID",
      key,
      storedHash: hash,
    }),
    true,
  );
  assert.equal(deliveryKeysMatch(key, hash), true);
  assert.equal(deliveryKeysMatch(createDeliveryKey(), hash), false);
}

{
  const priced = await startCheckout({
    publicId: PUBLIC_ID,
    body: {},
    deliveryKey: key,
    accessToken: TOKEN,
    origin: ORIGIN,
    gateway: gateway(),
    limiter: createPreferenceLimiter(() => 1_000),
    store: memory(record({ deliveryKeyHash: hash, amountArs: 1 })),
  });
  assert.deepEqual(priced, { ok: false, status: 409, error: "order-price" });
}

{
  const store = memory(record({ deliveryKeyHash: hash }));
  const result = await reconcilePayment({
    publicId: PUBLIC_ID,
    body: { paymentId: "100" },
    deliveryKey: key,
    accessToken: TOKEN,
    gateway: gateway({
      async getPayment() {
        return payment();
      },
    }),
    store,
    environment: "test",
  });
  assert.deepEqual(result, { ok: true, status: "PAID" });
  assert.equal(store.order().status, "PAID");
}

{
  const header = orderAccessCookie(PUBLIC_ID, key, false);
  assert.equal(header.includes("HttpOnly"), true);
  assert.equal(header.includes("Secure"), false);
  assert.equal(header.includes(TOKEN), false);
  assert.equal(readOrderAccess(header, PUBLIC_ID), key);
  assert.equal(readOrderAccess(header, "bbbbbbbbbbbbbbbbbbbbbbbb"), null);
  assert.equal(orderAccessCookie(PUBLIC_ID, key, true).includes("Secure"), true);
}

{
  const checkedAt = new Date("2026-10-27T15:00:00.000Z");
  const order = record();
  const simulated = decidePayment(
    order,
    payment({ liveMode: true, parties: "verified-test-users" }),
    checkedAt,
    "test",
  );
  assert.equal(simulated.action, "mark-paid");

  const realBuyer = decidePayment(
    order,
    payment({ liveMode: true, parties: "verified-real" }),
    checkedAt,
    "test",
  );
  assert.equal(realBuyer.action, "ignore");

  const unknown = decidePayment(
    order,
    payment({ liveMode: true, parties: "unverified" }),
    checkedAt,
    "test",
  );
  assert.equal(unknown.action, "ignore");

  const productionSimulation = decidePayment(
    order,
    payment({ liveMode: true, parties: "verified-test-users" }),
    checkedAt,
    "production",
  );
  assert.equal(productionSimulation.action, "ignore");

  const productionCharge = decidePayment(
    order,
    payment({ liveMode: true, parties: "verified-real", collectorId: "100", accountId: "100" }),
    checkedAt,
    "production",
  );
  assert.equal(productionCharge.action, "mark-paid");

  const otherCollector = decidePayment(
    order,
    payment({ liveMode: true, parties: "verified-real", collectorId: "200", accountId: "100" }),
    checkedAt,
    "production",
  );
  assert.equal(otherCollector.action, "ignore");

  const notLive = decidePayment(
    order,
    payment({ liveMode: false, parties: "verified-real", collectorId: "100", accountId: "100" }),
    checkedAt,
    "production",
  );
  assert.equal(notLive.action, "ignore");

  const store = memory(record({ deliveryKeyHash: hash }));
  const status = await notify(store, gateway({
    async getPayment() {
      return payment({ liveMode: true });
    },
  }));
  assert.equal(status, 200);
  assert.equal(store.order().status, "PAID");
  assert.equal(store.applies(), 1);
}

{
  assert.equal(
    classifyParties(
      classifyAccount({ email: "test_user_1@testuser.com", tags: ["test_user"] }),
      classifyAccount({ email: "test_user_2@testuser.com", tags: ["normal", "test_user"] }),
    ),
    "verified-test-users",
  );
  assert.equal(
    classifyParties(
      classifyAccount({ email: "persona@example.com", tags: ["normal"] }),
      classifyAccount({ email: "negocio@example.com", tags: [] }),
    ),
    "verified-real",
  );
  assert.equal(
    classifyParties(
      classifyAccount({ email: "test_user_1@testuser.com", tags: ["test_user"] }),
      classifyAccount({ email: "negocio@example.com", tags: ["normal"] }),
    ),
    "unverified",
  );
  assert.equal(classifyAccount({ email: "test_user_1@testuser.com", tags: ["normal"] }), "unverified");
  assert.equal(classifyAccount(null), "unverified");
  assert.equal(
    classifyAccount(
      { nickname: "TESTUSER4821", email: null, tags: [] },
      "test_user_4821@testuser.com",
    ),
    "test-user",
  );
  assert.equal(classifyAccount({ nickname: "TESTUSER4821", email: null, tags: [] }), "unverified");
  assert.equal(
    classifyAccount({ nickname: "TESTUSER4821", email: null, tags: [] }, "persona@example.com"),
    "unverified",
  );
  assert.equal(
    classifyAccount(
      { nickname: "TESTUSER4821", email: "persona@example.com", tags: ["normal"] },
      "test_user_4821@testuser.com",
    ),
    "real",
  );
  assert.equal(
    classifyAccount({
      email: "test_user_7@testuser.com",
      tags: [],
      testUserFlag: true,
    }),
    "test-user",
  );
}

{
  const seller = "100";
  const realPayment = payment({
    liveMode: true,
    parties: "verified-real",
    collectorId: seller,
    accountId: seller,
  });
  const store = memory(record({ deliveryKeyHash: hash }), "production");
  const remote = gateway({
    async getPayment() {
      return realPayment;
    },
  });
  const first = await processPaymentNotification({
    authentic: true,
    topic: "payment",
    dataId: "100",
    accessToken: "APP_USR-production-secret",
    gateway: remote,
    findOrder: store.find,
    apply: store.apply,
    environment: "production",
    now: new Date("2026-10-27T15:00:00.000Z"),
  });
  const second = await processPaymentNotification({
    authentic: true,
    topic: "payment",
    dataId: "100",
    accessToken: "APP_USR-production-secret",
    gateway: remote,
    findOrder: store.find,
    apply: store.apply,
    environment: "production",
    now: new Date("2026-10-27T15:00:00.000Z"),
  });
  assert.equal(first, 200);
  assert.equal(second, 200);
  assert.equal(store.order().status, "PAID");
  assert.equal(store.applies(), 1);
}

{
  const store = memory(record({ deliveryKeyHash: hash }), "production");
  const foreign = await processPaymentNotification({
    authentic: true,
    topic: "payment",
    dataId: "100",
    accessToken: "APP_USR-production-secret",
    gateway: gateway({
      async getPayment() {
        return payment({
          liveMode: true,
          parties: "verified-real",
          collectorId: "200",
          accountId: "100",
          externalReference: "bbbbbbbbbbbbbbbbbbbbbbbb",
        });
      },
    }),
    findOrder: store.find,
    apply: store.apply,
    environment: "production",
  });
  assert.equal(foreign, 200);
  assert.equal(store.order().status, "PENDING");
  assert.equal(store.applies(), 0);
}

{
  const store = memory(record({ deliveryKeyHash: hash }));
  let created = 0;
  const remote = gateway({
    async getPayment() {
      throw new Error("timeout");
    },
    async findPayments() {
      return [payment()];
    },
    async createPreference() {
      created += 1;
      throw new Error("should-not-create");
    },
  });
  assert.equal(await notify(store, remote), 500);
  assert.equal(store.order().status, "PENDING");
  const recovered = await reconcilePayment({
    publicId: PUBLIC_ID,
    body: {},
    deliveryKey: key,
    accessToken: TOKEN,
    gateway: remote,
    store,
    environment: "test",
  });
  assert.deepEqual(recovered, { ok: true, status: "PAID" });
  assert.equal(created, 0);
  assert.equal(store.applies(), 1);
}

{
  const secret = "APP_USR-production-secret";
  for (const status of ["refunded", "charged_back"] as const) {
    const store = memory(record({ deliveryKeyHash: hash, status: "PAID" }));
    const code = await notify(store, gateway({
      async getPayment() {
        return payment({ status });
      },
    }));
    assert.equal(code, 200);
    assert.equal(store.order().status, "PAID");
    assert.equal(store.applies(), 0);
  }

  const blocked = trackingGateway();
  const crossed = await startCheckout({
    publicId: PUBLIC_ID,
    body: {},
    deliveryKey: key,
    accessToken: secret,
    origin: ORIGIN,
    gateway: blocked.gateway,
    limiter: createPreferenceLimiter(() => 1_000),
    store: memory(record({ deliveryKeyHash: hash })),
    environment: "production",
    owner: "test-user",
  });
  assert.deepEqual(crossed, { ok: false, status: 503, error: "payments-not-configured" });
  assert.equal(blocked.created(), 0);

  const testWithRealOwner = trackingGateway();
  const wrongOwner = await startCheckout({
    publicId: PUBLIC_ID,
    body: {},
    deliveryKey: key,
    accessToken: secret,
    origin: ORIGIN,
    gateway: testWithRealOwner.gateway,
    limiter: createPreferenceLimiter(() => 1_000),
    store: memory(record({ deliveryKeyHash: hash })),
    environment: "test",
    owner: "real",
  });
  assert.deepEqual(wrongOwner, { ok: false, status: 503, error: "payments-not-configured" });
  assert.equal(testWithRealOwner.created(), 0);

  const allowed = trackingGateway();
  const productionCheckout = await startCheckout({
    publicId: PUBLIC_ID,
    body: {},
    deliveryKey: key,
    accessToken: secret,
    origin: ORIGIN,
    gateway: allowed.gateway,
    limiter: createPreferenceLimiter(() => 1_000),
    store: memory(record({ deliveryKeyHash: hash })),
    environment: "production",
    owner: "real",
  });
  assert.equal(productionCheckout.ok, true);
  assert.equal(allowed.created(), 1);

  const testCheckout = trackingGateway();
  const sandboxCheckout = await startCheckout({
    publicId: PUBLIC_ID,
    body: {},
    deliveryKey: key,
    accessToken: secret,
    origin: ORIGIN,
    gateway: testCheckout.gateway,
    limiter: createPreferenceLimiter(() => 1_000),
    store: memory(record({ deliveryKeyHash: hash })),
    environment: "test",
    owner: "test-user",
  });
  assert.equal(sandboxCheckout.ok, true);
  assert.equal(testCheckout.created(), 1);

  const testToken = trackingGateway();
  const testTokenInProduction = await startCheckout({
    publicId: PUBLIC_ID,
    body: {},
    deliveryKey: key,
    accessToken: TOKEN,
    origin: ORIGIN,
    gateway: testToken.gateway,
    limiter: createPreferenceLimiter(() => 1_000),
    store: memory(record({ deliveryKeyHash: hash })),
    environment: "production",
    owner: "real",
  });
  assert.deepEqual(testTokenInProduction, { ok: false, status: 503, error: "payments-not-configured" });
  assert.equal(testToken.created(), 0);

  assert.equal(credentialOwnerMatches("production", "real"), true);
  assert.equal(credentialOwnerMatches("production", "test-user"), false);
  assert.equal(credentialOwnerMatches("production", "unverified"), false);
  assert.equal(credentialOwnerMatches("production", null), false);
  assert.equal(credentialOwnerMatches("test", "test-user"), true);
  assert.equal(credentialOwnerMatches("test", "real"), false);
  assert.equal(credentialOwnerMatches(undefined, "test-user"), false);

  const testProfile = parseMercadoPagoUser({
    id: 100,
    email: "test_user_9@testuser.com",
    tags: ["test_user"],
    nickname: "TESTUSER9",
    test_data: { test_user: true },
  });
  assert.equal(testProfile?.id, "100");
  assert.equal(classifyAccount(testProfile?.account ?? null), "test-user");
  const realProfile = parseMercadoPagoUser({
    id: 200,
    email: "comercio@example.com",
    tags: ["normal"],
    nickname: "comercio",
  });
  assert.equal(classifyAccount(realProfile?.account ?? null), "real");
  assert.equal(classifyAccount(parseMercadoPagoUser({ id: 300, email: "", tags: [] })?.account ?? null), "unverified");
  assert.equal(parseMercadoPagoUser({ email: "comercio@example.com" }), null);
  assert.equal(parseMercadoPagoUser(null), null);
  assert.equal(parseMercadoPagoUser({}), null);
  assert.equal(parseMercadoPagoUser({ id: "cuenta" }), null);
  const incomplete = classifyAccount(parseMercadoPagoUser({ id: 400 })?.account ?? null);
  assert.equal(incomplete, "unverified");
  assert.equal(credentialOwnerMatches("production", incomplete), false);
  assert.equal(credentialOwnerMatches("test", incomplete), false);
  assert.equal(
    classifyAccount(parseMercadoPagoUser({ id: 401, tags: ["test_user"] })?.account ?? null),
    "unverified",
  );
}

{
  const views = createReconcileLimiter(() => 5_000);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    assert.equal(views.allow(PUBLIC_ID), true);
  }
  assert.equal(views.allow(PUBLIC_ID), false);
  assert.equal(views.allow("bbbbbbbbbbbbbbbbbbbbbbbb"), true);

  const store = memory(record({ deliveryKeyHash: hash }));
  let lookups = 0;
  const result = await reconcilePayment({
    publicId: PUBLIC_ID,
    body: {},
    deliveryKey: key,
    accessToken: TOKEN,
    gateway: gateway({
      async findPayments() {
        lookups += 1;
        return Array.from({ length: MAX_RECONCILE_PAYMENTS + 4 }, (_, index) =>
          payment({ id: String(index + 1), status: "pending" }),
        );
      },
    }),
    store,
    environment: "test",
  });
  assert.deepEqual(result, { ok: true, status: "PENDING" });
  assert.equal(lookups, 1);
  assert.equal(store.applies(), MAX_RECONCILE_PAYMENTS);
  assert.equal(store.order().status, "PENDING");

  const failed = await reconcilePayment({
    publicId: PUBLIC_ID,
    body: {},
    deliveryKey: key,
    accessToken: TOKEN,
    gateway: gateway({
      async findPayments() {
        throw new Error("timeout");
      },
    }),
    store,
    environment: "test",
  });
  assert.deepEqual(failed, { ok: false, status: 503, error: "payment-provider" });
  assert.equal(store.order().status, "PENDING");
  assert.equal(JSON.stringify(failed).includes(TOKEN), false);
}

console.log("payment flow checks passed");
