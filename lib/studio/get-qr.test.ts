import assert from "node:assert/strict";
import {
  accessFromAnswer,
  accessFromFailure,
  closedProblem,
  readAccessAnswer,
} from "./get-qr.ts";

const answer = (over: Record<string, unknown>) =>
  readAccessAnswer({ ok: true, freeFirst: false, promo: false, sales: false, payments: false, ...over })!;

// The free QR wins; otherwise a paid sale needs open sales AND a payment credential.
assert.deepEqual(accessFromAnswer(answer({ freeFirst: true })), { kind: "free" });
assert.deepEqual(accessFromAnswer(answer({ sales: true, payments: true })), { kind: "paid" });
assert.deepEqual(accessFromAnswer(answer({ sales: true })), { kind: "closed", reason: "payments-pending" });

// Free already used is told apart from "nothing is on sale".
assert.deepEqual(accessFromAnswer(answer({ promo: true })), { kind: "closed", reason: "free-used" });
assert.deepEqual(accessFromAnswer(answer({})), { kind: "closed", reason: "sales-closed" });
assert.equal(closedProblem("free-used").action, "recover");

// A failed check is an error, never "downloads are off".
assert.deepEqual(accessFromFailure(null), { kind: "error", reason: "connection" });
assert.deepEqual(accessFromFailure(429), { kind: "error", reason: "busy" });
assert.deepEqual(accessFromFailure(403), { kind: "error", reason: "session" });
assert.deepEqual(accessFromFailure(503), { kind: "error", reason: "service" });
assert.equal(readAccessAnswer({ error: "x" }), null);
assert.equal(readAccessAnswer(null), null);

console.log("get-qr tests passed");
