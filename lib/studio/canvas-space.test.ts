import assert from "node:assert/strict";
import { offCanvasElements, recoverAll, recoverElement, recoverableElements } from "./canvas-space.ts";
import { addImage, addRect, addText, removeElement, updateElement } from "./document.ts";
import { axisAlignedBounds } from "./geometry.ts";
import { inspirationDesigns } from "./inspiration.ts";
import { applyTemplate, createDocument, hiddenEditedTexts, templateList, withoutTemplateLeftovers } from "./templates.ts";
import { A6_HEIGHT_MM, A6_WIDTH_MM, type DesignDocumentV8, type StudioElement, type TemplateId } from "./types.ts";
import { elementsCoveringQr, qrProtectedBounds } from "./validation.ts";

let counter = 0;
const ids = () => () => `id-${++counter}`;
const templateIds = templateList.map((item) => item.id) as TemplateId[];
const freshCount = Object.fromEntries(templateIds.map((id) => [id, createDocument(id, ids()).elements.length]));

function assertClean(document: DesignDocumentV8, label: string) {
  assert.equal(document.parked.length, 0, `${label}: nothing parked`);
  assert.equal(recoverableElements(document).length, 0, `${label}: nothing off the canvas`);
  assert.equal(document.elements.filter((item) => item.type === "qr").length, 1, `${label}: one QR`);
  assert.equal(new Set(document.elements.map((item) => item.id)).size, document.elements.length, `${label}: unique ids`);
}
const inside = (element: StudioElement) => {
  const box = axisAlignedBounds(element);
  return box.x >= -0.01 && box.y >= -0.01 && box.x + box.width <= A6_WIDTH_MM + 0.01 && box.y + box.height <= A6_HEIGHT_MM + 0.01;
};
const overlaps = (a: StudioElement, b: StudioElement) => {
  const x = axisAlignedBounds(a);
  const y = axisAlignedBounds(b);
  return x.x < y.x + y.width && y.x < x.x + x.width && x.y < y.y + y.height && y.y < x.y + x.height;
};

// 0. Fresh templates and inspiration designs start with nothing off the canvas.
for (const id of templateIds) assertClean(createDocument(id, ids()), `fresh ${id}`);
for (const design of inspirationDesigns) assert.equal(offCanvasElements(design.document).length, 0, `inspiration ${design.id}`);

// 1. Every template in a row, from every starting template: no accumulation.
for (const start of templateIds) {
  let document = createDocument(start, ids());
  for (const id of [...templateIds, ...templateIds]) {
    document = applyTemplate(document, id, ids());
    assertClean(document, `${start} -> ${id}`);
    assert.equal(document.elements.length, freshCount[id], `${start} -> ${id}: same pieces as a fresh ${id}`);
  }
}

// 1b. Same from each inspiration design.
for (const design of inspirationDesigns) {
  let document = design.document;
  for (const id of templateIds) {
    document = applyTemplate(document, id, ids());
    assertClean(document, `${design.id} -> ${id}`);
  }
}

// 2. Clásico, Vivo, Nocturno back and forth many times.
{
  let document = createDocument("clasico", ids());
  for (let round = 0; round < 25; round += 1) {
    for (const id of ["clasico", "vivo", "nocturno"] as const) {
      document = applyTemplate(document, id, ids());
      assertClean(document, `round ${round} ${id}`);
    }
  }
  assert.ok(document.elements.length <= Math.max(...Object.values(freshCount)));
}

// 3. User edits survive: titles move between templates, own elements stay once, deletions stick.
{
  let document = createDocument("clasico", ids());
  const title = document.elements.find((item) => item.type === "text" && item.role === "titulo")!;
  document = updateElement(document, title.id, { text: "Panadería La Esquina" });
  document = addText(document, "mine-text");
  document = updateElement(document, "mine-text", { text: "Abierto de 8 a 20" });
  document = addRect(document, "mine-rect");
  const withImage = addImage(document, "mine-logo", "data:image/png;base64,aaaa", "Logo", 200, 200);
  assert.ok(withImage);
  document = withImage;
  for (const id of [...templateIds, "clasico", "vivo", "nocturno"] as TemplateId[]) {
    document = applyTemplate(document, id, ids());
    assertClean(document, `edited -> ${id}`);
    const titleNow = document.elements.find((item) => item.type === "text" && item.role === "titulo");
    assert.equal(titleNow?.type === "text" ? titleNow.text : null, "Panadería La Esquina", `${id} keeps the title`);
    for (const own of ["mine-text", "mine-rect", "mine-logo"]) {
      assert.equal(document.elements.filter((item) => item.id === own).length, 1, `${id} keeps ${own} once`);
    }
  }
  // Deleted own content does not come back when returning to a template that had it.
  document = removeElement(document, "mine-rect");
  document = applyTemplate(document, "vivo", ids());
  document = applyTemplate(document, "clasico", ids());
  assert.equal(document.elements.some((item) => item.id === "mine-rect"), false);
}

// 3b. An edited text the new style has no place for is reported, and comes back on return.
{
  let document = createDocument("corporativo", ids());
  const sub = document.elements.find((item) => item.type === "text" && item.role === "bajada");
  assert.ok(sub);
  document = updateElement(document, sub.id, { text: "Gomería y lubricentro" });
  const target = templateIds.find((id) => !createDocument(id, ids()).elements.some((item) => item.role === "bajada"));
  assert.ok(target, "some template has no bajada slot");
  const next = applyTemplate(document, target, ids());
  assert.deepEqual(hiddenEditedTexts(document, next).map((item) => item.text), ["Gomería y lubricentro"]);
  const back = applyTemplate(next, "corporativo", ids());
  assert.ok(back.elements.some((item) => item.type === "text" && item.text === "Gomería y lubricentro"));
  // Untouched template text is not reported.
  assert.equal(hiddenEditedTexts(createDocument("clasico", ids()), applyTemplate(createDocument("clasico", ids()), target, ids())).length, 0);
}

// 4. Moving one element off the canvas lists it; recovering puts it fully inside without overlaps.
{
  let document = createDocument("clasico", ids());
  document = addRect(document, "moved");
  document = updateElement(document, "moved", { x: -12, y: 60, width: 14, height: 8 });
  assert.deepEqual(recoverableElements(document).map((item) => item.id), ["moved"]);
  const result = recoverElement(document, "moved");
  assert.ok(result);
  const moved = result.document.elements.find((item) => item.id === "moved")!;
  assert.ok(inside(moved));
  assert.equal(result.clear, true);
  for (const other of result.document.elements) {
    if (other.id !== "moved") assert.equal(overlaps(moved, other), false, `recovered rect clear of ${other.id}`);
  }
  assert.equal(recoverableElements(result.document).length, 0);
  assert.equal(elementsCoveringQr(result.document).length, 0);
}

// 5. "Recuperar todos" with several real ones: inside, apart from each other, QR untouched.
{
  let document = createDocument("clasico", ids());
  const qr = document.elements.find((item) => item.type === "qr")!;
  document = updateElement(document, qr.id, { value: "https://search.google.com/local/writereview?placeid=ChIJabc" });
  // Small enough to fit in the free margins of Clásico (about 16 mm wide beside the code).
  for (const [id, x, y] of [["a", -200, 10], ["b", 200, 40]] as const) {
    document = addText(document, id);
    document = updateElement(document, id, { text: `Nota ${id}`, width: 14, fontSize: 4, x, y });
  }
  document = addRect(document, "c");
  document = updateElement(document, "c", { x: 30, y: 200, width: 14, height: 9 });
  assert.equal(recoverableElements(document).length, 3);
  const all = recoverAll(document);
  assert.equal(all.recovered, 3);
  assert.equal(all.left, 0);
  const placed = all.document.elements.filter((item) => ["a", "b", "c"].includes(item.id));
  for (const item of placed) assert.ok(inside(item), `${item.id} inside`);
  for (const a of placed) for (const b of placed) if (a.id < b.id) assert.equal(overlaps(a, b), false, `${a.id}/${b.id} apart`);
  const zone = qrProtectedBounds(all.document.elements.find((item) => item.type === "qr") as never);
  for (const item of placed) {
    const box = axisAlignedBounds(item);
    const hits = box.x < zone.x + zone.width && zone.x < box.x + box.width && box.y < zone.y + zone.height && zone.y < box.y + box.height;
    assert.equal(hits, false, `${item.id} stays off the QR`);
  }
  assert.equal(all.crowded, 0);
}

// 5b. No free spot: placement is predictable (same result twice) and reported as crowded.
{
  let document = createDocument("clasico", ids());
  document = addRect(document, "cover");
  document = updateElement(document, "cover", { x: 0, y: 0, width: A6_WIDTH_MM, height: A6_HEIGHT_MM });
  document = addRect(document, "lost");
  document = updateElement(document, "lost", { x: -30, y: 20, width: 34, height: 20 });
  const one = recoverElement(document, "lost");
  const two = recoverElement(document, "lost");
  assert.ok(one && two);
  assert.equal(one.clear, false);
  assert.deepEqual(
    one.document.elements.find((item) => item.id === "lost"),
    two.document.elements.find((item) => item.id === "lost"),
  );
  assert.ok(inside(one.document.elements.find((item) => item.id === "lost")!));
}

// 6. Sessions saved by older editors: template pieces in parked are dropped, user content kept.
{
  const document = createDocument("clasico", ids());
  const vivo = createDocument("vivo", ids());
  const leftover = vivo.elements.find((item) => item.type === "rect" && item.role !== null)!;
  const mine = { ...addText(document, "kept").elements.find((item) => item.id === "kept")! };
  const legacy = { ...document, parked: [leftover, mine] };
  const cleaned = withoutTemplateLeftovers(legacy);
  assert.deepEqual(cleaned.parked.map((item) => item.id), ["kept"]);
  assert.equal(withoutTemplateLeftovers(document), document);
  const switched = applyTemplate(legacy, "vivo", ids());
  assert.equal(switched.parked.some((item) => item.id === leftover.id), false);
  assert.ok(recoverElement(switched, "kept"));
}

console.log("canvas space checks passed");
