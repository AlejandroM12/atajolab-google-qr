import assert from "node:assert/strict";
import { studioCheckoutAllowed } from "@/lib/studio/checkout-access";

assert.equal(studioCheckoutAllowed({}), false);
assert.equal(studioCheckoutAllowed({ STUDIO_CHECKOUT_ENABLED: "" }), false);
assert.equal(studioCheckoutAllowed({ STUDIO_CHECKOUT_ENABLED: "0" }), false);
assert.equal(studioCheckoutAllowed({ STUDIO_CHECKOUT_ENABLED: "false" }), false);
assert.equal(studioCheckoutAllowed({ STUDIO_CHECKOUT_ENABLED: "off" }), false);
assert.equal(studioCheckoutAllowed({ NODE_ENV: "development" }), false);
assert.equal(studioCheckoutAllowed({ NODE_ENV: "production" }), false);

assert.equal(studioCheckoutAllowed({ STUDIO_CHECKOUT_ENABLED: "true" }), true);
assert.equal(studioCheckoutAllowed({ STUDIO_CHECKOUT_ENABLED: "1" }), true);
assert.equal(studioCheckoutAllowed({ STUDIO_CHECKOUT_ENABLED: "YES" }), true);
assert.equal(studioCheckoutAllowed({ STUDIO_CHECKOUT_ENABLED: "on" }), true);

console.log("studio checkout-access tests ok");
