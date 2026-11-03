import assert from "node:assert/strict";
import {
  createStudioOrderIdempotencyKey,
  deriveStudioV8DeliveryKey,
  hashStudioOrderIdempotencyKey,
  hashStudioOrderRequest,
  isStudioOrderIdempotencyKey,
  orderAccessSecret,
  studioOrderRequestHashesMatch,
} from "@/lib/studio/order-idempotency";
import { deliveryKeysMatch, hashDeliveryKey } from "@/lib/payments/access";

{
  const key = createStudioOrderIdempotencyKey();
  assert.equal(isStudioOrderIdempotencyKey(key), true);
  assert.equal(isStudioOrderIdempotencyKey("short"), false);
  assert.equal(hashStudioOrderIdempotencyKey(key).length, 64);
}

{
  const a = hashStudioOrderRequest({
    buyerEmail: "a@example.com",
    artworkJson: "{\"version\":8}",
  });
  const b = hashStudioOrderRequest({
    buyerEmail: "a@example.com",
    artworkJson: "{\"version\":8}",
  });
  const c = hashStudioOrderRequest({
    buyerEmail: "b@example.com",
    artworkJson: "{\"version\":8}",
  });
  assert.equal(studioOrderRequestHashesMatch(a, b), true);
  assert.equal(studioOrderRequestHashesMatch(a, c), false);
}

{
  assert.ok(orderAccessSecret({ NODE_ENV: "development" }));
  assert.equal(orderAccessSecret({ NODE_ENV: "production" }), null);
  assert.equal(
    orderAccessSecret({
      NODE_ENV: "production",
      ORDER_ACCESS_SECRET: "x".repeat(32),
    }),
    "x".repeat(32),
  );
}

{
  const secret = orderAccessSecret({ NODE_ENV: "test" })!;
  const stableKey = createStudioOrderIdempotencyKey();
  const left = deriveStudioV8DeliveryKey({
    publicId: "bbbbbbbbbbbbbbbbbbbbbbbb",
    draftKeyHash: "e".repeat(64),
    idempotencyKey: stableKey,
    secret,
  });
  const right = deriveStudioV8DeliveryKey({
    publicId: "bbbbbbbbbbbbbbbbbbbbbbbb",
    draftKeyHash: "e".repeat(64),
    idempotencyKey: stableKey,
    secret,
  });
  assert.equal(left, right);
  assert.equal(isStudioOrderIdempotencyKey(left), true);
  assert.equal(deliveryKeysMatch(left, hashDeliveryKey(right)), true);

  const other = deriveStudioV8DeliveryKey({
    publicId: "bbbbbbbbbbbbbbbbbbbbbbbb",
    draftKeyHash: "e".repeat(64),
    idempotencyKey: createStudioOrderIdempotencyKey(),
    secret,
  });
  assert.notEqual(left, other);
}

console.log("studio order-idempotency tests ok");
