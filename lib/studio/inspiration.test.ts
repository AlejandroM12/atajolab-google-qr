import assert from "node:assert/strict";
import {
  cloneInspirationDocument,
  getInspiration,
  inspirationDesigns,
  INSPIRATION_DEMO_QR,
} from "@/lib/studio/inspiration";
import {
  renderInspirationPreviewDataUrl,
  renderInspirationPreviewSvg,
} from "@/lib/studio/inspiration-preview";
import { wrapStudioText } from "@/lib/studio/export/wrap";
import { validateForExport } from "@/lib/studio/export/validate";
import { A6_HEIGHT_MM, A6_WIDTH_MM } from "@/lib/studio/types";

assert.equal(inspirationDesigns.length, 6);

for (const item of inspirationDesigns) {
  assert.ok(item.document.elements.some((element) => element.type === "qr"));
  const qr = item.document.elements.find((element) => element.type === "qr");
  assert.ok(qr && qr.type === "qr");
  assert.equal(qr.value, INSPIRATION_DEMO_QR);
  const gate = validateForExport(item.document);
  assert.equal(gate.ready, true, `${item.id} should be export-ready: ${JSON.stringify(gate.issues)}`);
  const svg = renderInspirationPreviewSvg(item.document);
  assert.match(svg, /<svg/);
  assert.match(svg, /width="100%"/);
  assert.match(
    svg,
    new RegExp(item.business.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
  );
  const dataUrl = await renderInspirationPreviewDataUrl(item.document);
  assert.match(dataUrl, /^data:image\/png;base64,/);

  for (const element of item.document.elements) {
    assert.ok(element.x >= -0.05, `${item.id}/${element.role}: left of sheet`);
    assert.ok(element.y >= -0.05, `${item.id}/${element.role}: above sheet`);
    assert.ok(element.x + element.width <= A6_WIDTH_MM + 0.05, `${item.id}/${element.role}: past right edge`);
    assert.ok(element.y + element.height <= A6_HEIGHT_MM + 0.05, `${item.id}/${element.role}: below sheet`);

    if (element.type === "text") {
      const wrapped = wrapStudioText({
        text: element.text,
        font: element.font,
        fontSize: element.fontSize,
        width: element.width,
      });
      const needed = wrapped.lines.length * wrapped.lineHeight + element.fontSize * 0.35;
      assert.ok(
        element.height + 0.05 >= needed,
        `${item.id}/${element.role}: text box too short (${element.height} < ${needed}) for "${element.text}"`,
      );
      assert.ok(element.fontSize >= 3.4, `${item.id}/${element.role}: font too small for print`);
    }
    if (element.type === "qr") {
      assert.ok(Math.min(element.width, element.height) >= 46, `${item.id}/qr: too small`);
    }
  }
}

assert.equal(getInspiration("taller")?.name, "Automotor");
assert.equal(getInspiration("peluqueria")?.name, "Belleza");
assert.equal(getInspiration("missing"), null);

const source = getInspiration("taller");
assert.ok(source);
const clone = cloneInspirationDocument(source.document, (prefix) => `new-${prefix}`);
assert.notEqual(clone.elements[0]?.id, source.document.elements[0]?.id);
assert.equal(clone.elements.length, source.document.elements.length);

console.log("studio inspiration tests ok");
