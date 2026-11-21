import assert from "node:assert/strict";
import { freeFirstQrOpen } from "./free-first-qr.ts";
import { standbyHost } from "./standby-host.ts";
import { studioCheckoutAllowed, studioSalesOpen } from "./studio/checkout-access.ts";

const on = { STUDIO_CHECKOUT_ENABLED: "true", STUDIO_SALES_CONFIRMED: "true", FREE_FIRST_QR_ENABLED: "true", NODE_ENV: "production" };

// Not on Render (the VPS, a laptop): nothing changes.
assert.equal(standbyHost({}), false);
assert.equal(standbyHost({ RENDER: "false" }), false);
assert.equal(studioSalesOpen(on), true);
assert.equal(freeFirstQrOpen(on), true);

// On Render the commercial side is closed by default, whatever the switches say.
assert.equal(standbyHost({ RENDER: "true" }), true);
assert.equal(studioCheckoutAllowed({ ...on, RENDER: "true" }), false);
assert.equal(studioSalesOpen({ ...on, RENDER: "true" }), false);
assert.equal(freeFirstQrOpen({ ...on, RENDER: "true" }), false);

// RENDER_ACTIVE=true is the deliberate switch to roll traffic back to Render.
for (const active of ["true", "1", "yes", "on", " TRUE "]) {
  assert.equal(standbyHost({ RENDER: "true", RENDER_ACTIVE: active }), false, active);
}
assert.equal(studioSalesOpen({ ...on, RENDER: "true", RENDER_ACTIVE: "true" }), true);
assert.equal(freeFirstQrOpen({ ...on, RENDER: "true", RENDER_ACTIVE: "true" }), true);
assert.equal(standbyHost({ RENDER: "true", RENDER_ACTIVE: "false" }), true);
assert.equal(standbyHost({ RENDER: "true", RENDER_ACTIVE: "" }), true);

console.log("standby-host checks passed");
