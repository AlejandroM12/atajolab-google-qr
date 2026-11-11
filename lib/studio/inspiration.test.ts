import assert from "node:assert/strict";
import { inspectQrPayload } from "@/lib/qr-content";
import { offCanvasElements } from "@/lib/studio/canvas-space";
import { DEMO_QR, isDemoQr } from "@/lib/studio/demo-qr";
import { updateElement } from "@/lib/studio/document";
import {
  cloneInspirationDocument,
  getInspiration,
  inspirationDesigns,
} from "@/lib/studio/inspiration";
import {
  renderInspirationPreviewDataUrl,
  renderInspirationPreviewSvg,
  renderInspirationPreviewWebp,
} from "@/lib/studio/inspiration-preview";
import { inspirationPreviewUrl } from "@/lib/studio/inspiration-preview-url";
import { wrapStudioText } from "@/lib/studio/export/wrap";
import { validateForExport } from "@/lib/studio/export/validate";
import { parseDesign, serializeDesign } from "@/lib/studio/serialize";
import { elementsCoveringQr, validateDesign } from "@/lib/studio/validation";

assert.equal(inspirationDesigns.length, 6);
// One example per use, not six versions of the same Google review sign.
assert.deepEqual(
  inspirationDesigns.map((item) => item.id),
  ["instagram", "whatsapp", "menu", "evento", "wifi", "resenas"],
);
assert.equal(new Set(inspirationDesigns.map((item) => item.document.templateId)).size, 6);
assert.ok(new Set(inspirationDesigns.map((item) => item.document.format.id)).size >= 4);

for (const item of inspirationDesigns) {
  const qr = item.document.elements.find((element) => element.type === "qr");
  assert.ok(qr && qr.type === "qr");
  assert.equal(qr.value, DEMO_QR[item.id]);
  assert.equal(inspectQrPayload(qr.value).issue, null, item.id);

  // Drawn by the export engine as it is.
  const gate = validateForExport(item.document);
  assert.equal(gate.ready, true, `${item.id} should be export-ready: ${JSON.stringify(gate.issues)}`);
  assert.deepEqual(elementsCoveringQr(item.document), [], item.id);
  assert.equal(offCanvasElements(item.document).length, 0, item.id);
  assert.deepEqual(
    validateDesign(item.document).warnings.filter((warning) => warning.code.startsWith("text-contrast")),
    [],
    item.id,
  );

  // The sample code cannot be ordered; with the user's own content the design is ready.
  const sample = validateForExport(item.document, { commercial: true });
  assert.deepEqual(sample.errors.map((issue) => issue.code), ["qr-demo"], item.id);
  const own = updateElement(item.document, qr.id, { value: "https://mi-negocio.example/" });
  assert.equal(validateForExport(own, { commercial: true }).ready, true, item.id);

  const svg = renderInspirationPreviewSvg(item.document);
  assert.match(svg, /<svg/);
  assert.match(svg, /width="100%"/);
  assert.match(svg, new RegExp(item.business.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  const dataUrl = await renderInspirationPreviewDataUrl(item.document);
  assert.match(dataUrl, /^data:image\/png;base64,/);
  const webp = await renderInspirationPreviewWebp(item.document);
  assert.equal(webp.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(webp.subarray(8, 12).toString("ascii"), "WEBP");
  // Gallery previews must stay small: a fraction of the print PNG.
  assert.ok(webp.length < 120_000, `${item.id}: preview too large (${webp.length} bytes)`);
  assert.ok(webp.length * 2 < dataUrl.length, `${item.id}: preview not much smaller than the print PNG`);
  assert.match(inspirationPreviewUrl(item.id), /^\/previews\/inspiracion\/[a-z]+\?v=[0-9a-f]{10}$/);

  for (const element of item.document.elements) {
    if (element.type !== "text") continue;
    // The sizes come from an estimate that runs in the browser: check them against the print metrics.
    const wrapped = wrapStudioText({
      text: element.text,
      font: element.font,
      fontSize: element.fontSize,
      width: element.width,
    });
    assert.ok(
      wrapped.lines.length * wrapped.lineHeight <= element.height + 0.01,
      `${item.id}/${element.role}: "${element.text}" does not fit (${wrapped.lines.length} lines of ${wrapped.lineHeight} in ${element.height})`,
    );
  }

  // The editor opens it like any other saved design.
  const parsed = parseDesign(serializeDesign(item.document));
  assert.ok(parsed, item.id);
  assert.deepEqual(parsed.document, item.document, item.id);
}

assert.equal(isDemoQr(` ${DEMO_QR.wifi} `), true);
assert.equal(isDemoQr("https://mi-negocio.example/"), false);

assert.equal(getInspiration("instagram")?.name, "Perfil de Instagram");
assert.equal(getInspiration("missing"), null);
// Links to the earlier gallery still open a close example.
assert.equal(getInspiration("taller")?.id, "resenas");
assert.equal(getInspiration("cafeteria")?.id, "menu");

const source = getInspiration("evento");
assert.ok(source);
const clone = cloneInspirationDocument(source.document, (prefix) => `new-${prefix}`);
assert.notEqual(clone.elements[0]?.id, source.document.elements[0]?.id);
assert.equal(clone.elements.length, source.document.elements.length);
assert.deepEqual(clone.format, source.document.format);

console.log("studio inspiration tests ok");
