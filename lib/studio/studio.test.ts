import assert from "node:assert/strict";
import {
  addImage,
  addRect,
  addText,
  duplicateElement,
  ensureQrOnTop,
  moveLayer,
  removeElement,
  restoreParked,
  setBackground,
  updateElement,
  withGeometry,
} from "@/lib/studio/document";
import { commit, flushDraft, historyFrom, redo, replacePresent, undo } from "@/lib/studio/history";
import type { IdFactory } from "@/lib/studio/ids";
import { classifyImage, imageSrcIssue } from "@/lib/studio/images";
import { commitStudioNumber, parseStudioNumber } from "@/lib/studio/number-input";
import { loadSessionDesign, STUDIO_STORAGE_KEY, writeDesign, type StorageLike } from "@/lib/studio/persistence";
import { validateForExport } from "@/lib/studio/export/validate";
import { qrContrastIssue } from "@/lib/studio/qr-rules";
import { parseDesign, serializeDesign } from "@/lib/studio/serialize";
import { applySuggestedColors, applyTemplate, createBlankDocument, createDocument } from "@/lib/studio/templates";
import type { DesignDocumentV8, QrElement, TextElement } from "@/lib/studio/types";
import { elementsCoveringQr, validateDesign } from "@/lib/studio/validation";

function ids(): IdFactory {
  let n = 0;
  return (prefix) => `${prefix}-${++n}`;
}

function textOf(document: DesignDocumentV8, role: string): TextElement {
  const element = [...document.elements, ...document.parked].find((item) => item.role === role);
  if (!element || element.type !== "text") throw new Error(`missing text ${role}`);
  return element;
}

function qrOf(document: DesignDocumentV8): QrElement {
  const element = document.elements.find((item) => item.type === "qr");
  if (!element || element.type !== "qr") throw new Error("missing qr");
  return element;
}

function replaceQr(source: DesignDocumentV8, next: QrElement): DesignDocumentV8 {
  return { ...source, elements: source.elements.map((item) => (item.type === "qr" ? next : item)) };
}

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();
  fail = false;
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.fail) {
      const error = new Error("quota");
      error.name = "QuotaExceededError";
      throw error;
    }
    this.values.set(key, value);
  }
}

assert.equal(parseStudioNumber("38"), 38);
assert.equal(parseStudioNumber("12,5"), 12.5);
assert.equal(parseStudioNumber(""), null);
assert.equal(parseStudioNumber("abc"), null);
assert.equal(commitStudioNumber("10", 22, 90), 22);
assert.equal(commitStudioNumber("50", 22, 90), 50);
assert.equal(commitStudioNumber("45", -180, 180), 45);

const document = createDocument("corporativo", ids());
const title = textOf(document, "titulo");
const qr = qrOf(document);

assert.equal(document.version, 8);
assert.equal(document.format.widthMm, 105);
assert.equal(document.format.heightMm, 148);
assert.equal(document.background, "#f4f0e6");
assert.equal(document.elements.length, 10);
assert.equal(title.x, 10);
assert.equal(title.text, "Wi-Fi para clientes");
assert.equal(qr.width, 44);
assert.equal(qr.height, 44);
assert.equal(document.elements.filter((element) => element.type === "qr").length, 1);
assert.equal(document.elements.at(-1)?.type, "qr");

const blank = createBlankDocument(ids());
assert.equal(blank.background, "#ffffff");
assert.equal(blank.elements.length, 2);
assert.equal(blank.elements.filter((element) => element.type === "qr").length, 1);
assert.equal(blank.elements.at(-1)?.type, "qr");

const classic = createDocument("clasico", ids());
assert.equal(classic.templateId, "clasico");
assert.equal(classic.background, "#fffcf8");
assert.ok(classic.elements.some((element) => element.type === "qr"));
assert.ok(createDocument("vivo", ids()).elements.length >= 4);
assert.ok(createDocument("nocturno", ids()).elements.length >= 4);
assert.ok(createDocument("negocio", ids()).elements.length >= 4);

const moved = updateElement(document, title.id, { x: 12.5, y: 40, width: 70, height: 18 });
const movedTitle = textOf(moved, "titulo");
assert.equal(movedTitle.x, 12.5);
assert.equal(movedTitle.y, 40);
assert.equal(movedTitle.width, 70);
assert.equal(movedTitle.height, 18);

const longText = "a".repeat(200);
const shortened = updateElement(document, title.id, { text: longText });
assert.equal(textOf(shortened, "titulo").text.length, 180);

const added = addText(document, "extra-1");
const extra = added.elements.find((element) => element.id === "extra-1");
assert.ok(extra && extra.type === "text");
assert.equal(extra.text, "Nuevo texto");
assert.ok(added.elements.findIndex((element) => element.id === "extra-1") < added.elements.findIndex((element) => element.type === "qr"));

const renamed = updateElement(added, "extra-1", { text: "Horario de 9 a 18" });
const withLink = updateElement(renamed, qr.id, { value: "https://example.com/puesto" });
const customTitle = updateElement(withLink, title.id, { text: "Kiosco del parque", x: 12.5, y: 40 });
const customRubro = updateElement(customTitle, textOf(document, "rubro").id, { text: "Puesto del parque" });
const customNote = updateElement(customRubro, textOf(document, "bajada").id, { text: "Estamos en el centro" });
const blue = setBackground(customNote, "#0b3d5c");
const src = "data:image/png;base64,aaaa";
const withLogo = addImage(blue, "logo-1", src, "Marca propia", 400, 200);
assert.ok(withLogo);
assert.equal(withLogo.background, "#0b3d5c");
assert.equal(withLogo.elements.find((element) => element.id === "logo-1")?.type, "image");
assert.ok(withLogo.elements.findIndex((element) => element.id === "logo-1") < withLogo.elements.findIndex((element) => element.type === "qr"));

assert.equal(addImage(document, "bad", "javascript:alert(1)", "x", 20, 20), null);
assert.equal(removeElement(withLogo, qr.id), withLogo);
assert.equal(duplicateElement(withLogo, qr.id, "qr-copy"), withLogo);

const copy = duplicateElement(withLogo, "extra-1", "extra-2");
const duplicated = copy.elements.find((element) => element.id === "extra-2");
assert.ok(duplicated);
assert.equal(duplicated.role, null);

const creative = applyTemplate(withLogo, "creativo", ids());
assert.equal(creative.templateId, "creativo");
assert.equal(creative.background, "#0b3d5c");
assert.equal(textOf(creative, "titulo").text, "Kiosco del parque");
assert.equal(textOf(creative, "bajada").text, "Estamos en el centro");
assert.equal(qrOf(creative).id, qr.id);
assert.equal(qrOf(creative).value, "https://example.com/puesto");
assert.equal(qrOf(creative).width, 48);
assert.equal(creative.elements.filter((element) => element.type === "qr").length, 1);
assert.ok(creative.layouts?.corporativo);
// Elements the user added stay on the sheet; nothing from the old composition is parked.
assert.ok(creative.elements.some((element) => element.type === "text" && element.text === "Horario de 9 a 18"));
assert.ok(creative.elements.some((element) => element.type === "image"));
assert.equal(creative.parked.length, 0);

const painted = applySuggestedColors(creative);
assert.equal(painted.background, "#0b5348");
assert.equal(textOf(painted, "titulo").fill, "#1c1915");

const back = applyTemplate(painted, "corporativo", ids());
assert.equal(back.background, "#0b5348");
assert.equal(textOf(back, "titulo").text, "Kiosco del parque");
assert.equal(textOf(back, "titulo").x, 12.5);
assert.equal(textOf(back, "rubro").text, "Puesto del parque");
assert.equal(qrOf(back).value, "https://example.com/puesto");
assert.ok(back.layouts?.creativo);

assert.equal(back.elements.filter((element) => element.type === "text" && element.text === "Horario de 9 a 18").length, 1);
assert.equal(back.elements.filter((element) => element.type === "image").length, 1);
assert.equal(back.parked.length, 0);

// Legacy parked user content can still be restored.
const legacyText = back.elements.find((element) => element.type === "text" && element.text === "Horario de 9 a 18")!;
const legacy = { ...back, elements: back.elements.filter((element) => element.id !== legacyText.id), parked: [legacyText] };
const restored = restoreParked(legacy, legacyText.id);
assert.ok(restored.elements.some((element) => element.type === "text" && element.text === "Horario de 9 a 18"));

const topId = document.elements.at(-1)?.id;
assert.ok(topId);
const lowered = moveLayer(document, topId, "down");
assert.notEqual(lowered.elements.at(-1)?.id, topId);

let history = historyFrom(document);
const colored = setBackground(document, "#112233");
history = commit(history, colored);
history = commit(history, setBackground(history.present, "#223344"));
assert.equal(history.past.length, 2);
history = undo(history);
assert.equal(history.present.background, "#112233");
history = redo(history);
assert.equal(history.present.background, "#223344");
history = undo(history);
history = commit(history, setBackground(history.present, "#334455"));
assert.equal(history.future.length, 0);
assert.equal(history.present.background, "#334455");
assert.equal(setBackground(document, "#gggggg"), document);

const base = historyFrom(document);
const typed = replacePresent(base, updateElement(document, title.id, { text: "Hola" }));
const flushed = flushDraft(typed, base.present);
assert.equal(flushed.past.length, 1);
assert.equal(textOf(flushed.present, "titulo").text, "Hola");
assert.equal(textOf(undo(flushed).present, "titulo").text, "Wi-Fi para clientes");

const square = withGeometry(qr, { x: qr.x, y: qr.y, width: 40, height: 20, rotation: 0 });
assert.equal(square.type, "qr");
if (square.type === "qr") {
  assert.equal(square.width, square.height);
  assert.equal(square.width, 40);
}
const tiny = withGeometry(qr, { x: -10, y: -8, width: 10, height: 10, rotation: 0 });
if (tiny.type === "qr") {
  assert.equal(tiny.width, 22);
  assert.equal(tiny.height, 22);
}
const rotated = withGeometry(qr, { x: 0, y: 0, width: 90, height: 90, rotation: 45 });
if (rotated.type === "qr") {
  assert.equal(rotated.width, rotated.height);
  assert.ok(rotated.width < 90);
}
// Inspector edits one field at a time: width 50 -> 40 must give 40 x 40 without moving X/Y.
{
  const big = qrOf(updateElement(document, qr.id, { x: 20, y: 30, width: 50, height: 50 }));
  assert.deepEqual([big.x, big.y, big.width, big.height], [20, 30, 50, 50]);
  const next = updateElement(replaceQr(document, big), qr.id, { width: 40 });
  const smaller = qrOf(next);
  assert.deepEqual([smaller.x, smaller.y, smaller.width, smaller.height], [20, 30, 40, 40]);
  const byHeight = qrOf(updateElement(replaceQr(document, big), qr.id, { height: 35 }));
  assert.deepEqual([byHeight.x, byHeight.y, byHeight.width, byHeight.height], [20, 30, 35, 35]);
  // Minimum and sheet limits still apply.
  const min = qrOf(updateElement(replaceQr(document, big), qr.id, { width: 10 }));
  assert.equal(min.width, 22);
  assert.equal(min.height, 22);
  const edge = qrOf(updateElement(replaceQr(document, big), qr.id, { x: 90 }));
  assert.ok(edge.x + edge.width <= document.format.widthMm);
  assert.equal(edge.width, edge.height);
  // Other element types keep independent width/height.
  const wide = textOf(updateElement(document, title.id, { width: 40 }), "titulo");
  assert.equal(wide.width, 40);
  assert.equal(wide.height, title.height);
  // Exported document keeps the resized square and stays valid.
  const exported = replaceQr(document, smaller);
  assert.equal(validateForExport(exported).issues.some((issue) => issue.code === "qr-size"), false);
  assert.equal(validateForExport(exported).issues.some((issue) => issue.code === "out-of-bounds"), false);
}
assert.equal(updateElement(document, qr.id, { foreground: "#ffffff", background: "#000000" }), document);
assert.equal(qrContrastIssue("#14221f", "#ffffff"), null);
assert.equal(qrContrastIssue("#ffffff", "#14221f")?.code, "inverted");
assert.equal(qrContrastIssue("#7a7a7a", "#8a8a8a")?.code, "low-contrast");

const cover = addRect(document, "cover-1");
const coverEl = cover.elements.find((element) => element.id === "cover-1");
assert.ok(coverEl);
const overQr = updateElement(cover, coverEl.id, { x: qr.x, y: qr.y, width: qr.width, height: qr.height });
const raised = moveLayer(overQr, coverEl.id, "up");
assert.ok(elementsCoveringQr(raised).some((item) => item.id === coverEl.id));
const invalid = validateDesign(raised);
assert.equal(invalid.ready, false);
assert.ok(invalid.warnings.some((warning) => warning.code === "qr-covered" && warning.blocking));
const fixed = ensureQrOnTop(raised);
assert.equal(elementsCoveringQr(fixed).length, 0);
assert.equal(validateDesign(fixed).ready, true);

const lowText = updateElement(document, title.id, { fill: "#f4f0e6" });
const contrastWarn = validateDesign(lowText);
assert.ok(contrastWarn.warnings.some((warning) => warning.code === "text-contrast"));

const raw = serializeDesign(document);
const parsed = parseDesign(raw);
assert.ok(parsed);
assert.equal(parsed.droppedImages, 0);
assert.equal(parsed.repairedQr, false);
assert.deepEqual(parsed.document, document);

const version7 = JSON.parse(raw) as { version: number };
version7.version = 7;
assert.equal(parseDesign(JSON.stringify(version7)), null);

const missingQr = JSON.parse(raw) as { elements: { type: string }[] };
missingQr.elements = missingQr.elements.filter((element) => element.type !== "qr");
assert.equal(parseDesign(JSON.stringify(missingQr)), null);

const twoQr = JSON.parse(raw) as { elements: unknown[] };
const clonedQr = structuredClone(twoQr.elements.find((element) => (element as { type: string }).type === "qr")) as {
  id: string;
};
clonedQr.id = "qr-extra";
twoQr.elements.push(clonedQr);
assert.equal(parseDesign(JSON.stringify(twoQr)), null);

const badImage = JSON.parse(serializeDesign(withLogo)) as { elements: Record<string, unknown>[] };
badImage.elements.push({
  id: "bad-image",
  role: null,
  type: "image",
  x: 10,
  y: 10,
  width: 20,
  height: 20,
  rotation: 0,
  src: "data:image/svg+xml;base64,PHN2Zy8+",
  alt: "Logo",
});
const dropped = parseDesign(JSON.stringify(badImage));
assert.ok(dropped);
assert.equal(dropped.droppedImages, 1);
assert.equal(dropped.document.elements.some((element) => element.id === "bad-image"), false);

const weakQr = JSON.parse(raw) as { elements: { type: string; foreground?: string; background?: string }[] };
const weak = weakQr.elements.find((element) => element.type === "qr");
assert.ok(weak);
weak.foreground = "#ffffff";
weak.background = "#ffffff";
const repaired = parseDesign(JSON.stringify(weakQr));
assert.ok(repaired);
assert.equal(repaired.repairedQr, true);
assert.equal(qrOf(repaired.document).foreground, "#14221f");

assert.equal(imageSrcIssue("javascript:alert(1)"), "type");
assert.equal(imageSrcIssue("data:image/svg+xml;base64,PHN2Zw=="), "type");
assert.equal(imageSrcIssue("data:image/png;base64,aaaa"), null);
assert.equal(imageSrcIssue(`data:image/png;base64,${"a".repeat(1_800_000)}`), "size");

assert.equal(classifyImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpg"), "jpeg");
assert.equal(classifyImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1]), ""), "jpeg");
assert.equal(classifyImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/jpeg"), "png");
const webp = new Uint8Array(12);
webp.set([0x52, 0x49, 0x46, 0x46], 0);
webp.set([0x57, 0x45, 0x42, 0x50], 8);
assert.equal(classifyImage(webp, ""), "webp");
const heic = new Uint8Array(16);
heic.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], 0);
assert.equal(classifyImage(heic, ""), "heic");
assert.equal(classifyImage(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), "image/gif"), "unknown");

const storage = new MemoryStorage();
assert.deepEqual(writeDesign(storage, document), { ok: true });
assert.deepEqual(readBack(storage), document);
storage.fail = true;
assert.deepEqual(writeDesign(storage, document), { ok: false, reason: "quota" });
storage.fail = false;
storage.setItem(STUDIO_STORAGE_KEY, "{");
const broken = loadSessionDesign(storage);
assert.match(broken.notice ?? "", /No pudimos leer/);
assert.equal(broken.persist, true);
assert.equal(broken.document.version, 8);

function readBack(store: StorageLike): DesignDocumentV8 {
  const rawDesign = store.getItem(STUDIO_STORAGE_KEY);
  const result = rawDesign ? parseDesign(rawDesign) : null;
  if (!result) throw new Error("stored design did not parse");
  return result.document;
}
