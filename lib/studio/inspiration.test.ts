import assert from "node:assert/strict";
import {
  cloneInspirationDocument,
  getInspiration,
  inspirationDesigns,
  INSPIRATION_DEMO_QR,
} from "@/lib/studio/inspiration";
import { renderInspirationPreviewSvg } from "@/lib/studio/inspiration-preview";
import { validateForExport } from "@/lib/studio/export/validate";

assert.equal(inspirationDesigns.length, 6);

for (const item of inspirationDesigns) {
  assert.ok(item.document.elements.some((element) => element.type === "qr"));
  const qr = item.document.elements.find((element) => element.type === "qr");
  assert.ok(qr && qr.type === "qr");
  assert.equal(qr.value, INSPIRATION_DEMO_QR);
  const gate = validateForExport(item.document);
  assert.equal(gate.ready, true, `${item.id} should be export-ready`);
  const svg = renderInspirationPreviewSvg(item.document);
  assert.match(svg, /<svg/);
  assert.match(svg, new RegExp(item.business.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

const source = getInspiration("taller");
assert.ok(source);
const clone = cloneInspirationDocument(source.document, (prefix) => `new-${prefix}`);
assert.notEqual(clone.elements[0]?.id, source.document.elements[0]?.id);
assert.equal(clone.elements.length, source.document.elements.length);

console.log("studio inspiration tests ok");
