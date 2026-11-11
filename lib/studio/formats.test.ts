import assert from "node:assert/strict";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { buildQrContent } from "@/lib/qr-content";
import { offCanvasElements } from "@/lib/studio/canvas-space";
import { buildStudioCommercialArtwork, readStudioCommercialArtwork } from "@/lib/studio/commercial-artwork";
import { addImage, addRect, addText, updateElement } from "@/lib/studio/document";
import { exportStudioDesign } from "@/lib/studio/export/index";
import { studioPrintPixels } from "@/lib/studio/export/units";
import { validateForExport } from "@/lib/studio/export/validate";
import {
  designFormat,
  fontMaxMm,
  formatList,
  formatShape,
  qrMaxMm,
  readDesignFormat,
  type FormatId,
} from "@/lib/studio/formats";
import { axisAlignedBounds } from "@/lib/studio/geometry";
import type { IdFactory } from "@/lib/studio/ids";
import { parseDesign, serializeDesign } from "@/lib/studio/serialize";
import {
  applyTemplate,
  changeFormat,
  createBlankDocument,
  createDocument,
  templateList,
} from "@/lib/studio/templates";
import { QR_MIN_MM, type DesignDocumentV8, type QrElement, type StudioElement } from "@/lib/studio/types";
import { elementsCoveringQr } from "@/lib/studio/validation";

function ids(): IdFactory {
  let n = 0;
  return (prefix) => `${prefix}-${++n}`;
}

function qrOf(document: DesignDocumentV8): QrElement {
  const qr = document.elements.find((element): element is QrElement => element.type === "qr");
  assert.ok(qr);
  return qr;
}

function withQr(document: DesignDocumentV8, value: string): DesignDocumentV8 {
  return updateElement(document, qrOf(document).id, { value });
}

function inside(element: StudioElement, document: DesignDocumentV8): boolean {
  const box = axisAlignedBounds(element);
  return (
    box.x >= -0.01 &&
    box.y >= -0.01 &&
    box.x + box.width <= document.format.widthMm + 0.01 &&
    box.y + box.height <= document.format.heightMm + 0.01
  );
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  return a.x < b.x + b.width - 0.01 && b.x < a.x + a.width - 0.01 && a.y < b.y + b.height - 0.01 && b.y < a.y + a.height - 0.01;
}

function decodePng(body: Buffer): string | null {
  const image = PNG.sync.read(body);
  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data ?? null;
}

const LINK = "https://example.com/promo";

// The catalog: A6 stays the default and keeps its exact size.
assert.deepEqual(designFormat("a6"), { id: "a6", widthMm: 105, heightMm: 148 });
assert.equal(qrMaxMm(designFormat("a6")), 90);
assert.equal(fontMaxMm(designFormat("a6")), 24);
assert.deepEqual(
  formatList.map((format) => [format.id, formatShape(format)]),
  [
    ["a6", "portrait"],
    ["a5", "portrait"],
    ["a4", "portrait"],
    ["tarjeta", "landscape"],
    ["etiqueta", "square"],
    ["post", "square"],
    ["historia", "portrait"],
  ],
);
assert.equal(readDesignFormat({ id: "a6", widthMm: 105, heightMm: 148 })?.id, "a6");
assert.equal(readDesignFormat({ id: "a6", widthMm: 210, heightMm: 148 }), null);
assert.equal(readDesignFormat({ id: "a3", widthMm: 297, heightMm: 420 }), null);
// Screen formats export at the pixel size social networks use.
assert.equal(studioPrintPixels(designFormat("post").widthMm), 1080);
assert.equal(studioPrintPixels(designFormat("historia").widthMm), 1080);
assert.equal(studioPrintPixels(designFormat("historia").heightMm), 1920);

const a6Roles = new Map(
  templateList.map((template) => [
    template.id,
    createDocument(template.id, ids())
      .elements.map((element) => `${element.type}:${element.role}`)
      .sort(),
  ]),
);

// Every template composes on every format: all pieces inside the sheet, one scannable QR, nothing on it.
for (const format of formatList) {
  for (const template of templateList) {
    const label = `${template.id}/${format.id}`;
    const document = createDocument(template.id, ids(), format.id);
    assert.deepEqual(document.format, designFormat(format.id), label);
    assert.deepEqual(
      document.elements.map((element) => `${element.type}:${element.role}`).sort(),
      a6Roles.get(template.id),
      `${label}: same pieces as A6`,
    );
    assert.equal(document.elements.filter((element) => element.type === "qr").length, 1, label);
    for (const element of document.elements) assert.ok(inside(element, document), `${label}: ${element.role} inside`);
    assert.equal(offCanvasElements(document).length, 0, label);

    const qr = qrOf(document);
    assert.equal(qr.width, qr.height, label);
    assert.ok(qr.width >= QR_MIN_MM && qr.width <= qrMaxMm(document.format), `${label}: qr ${qr.width}`);
    assert.deepEqual(elementsCoveringQr(document), [], label);
    // No text box runs under the code either.
    for (const element of document.elements) {
      if (element.type === "text") assert.ok(!overlaps(qr, element), `${label}: ${element.role} under the QR`);
    }

    const ready = withQr(document, LINK);
    const validation = validateForExport(ready, { commercial: true });
    assert.deepEqual(validation.errors, [], label);

    // Saved sessions and orders read the format back unchanged.
    const parsed = parseDesign(serializeDesign(ready));
    assert.ok(parsed, label);
    assert.deepEqual(parsed.document, ready, `${label}: round trip`);
    const built = buildStudioCommercialArtwork(ready);
    assert.ok(built.ok, label);
    assert.deepEqual(built.artwork.format, designFormat(format.id));
    assert.deepEqual(readStudioCommercialArtwork(JSON.parse(JSON.stringify(built.artwork)))?.format, designFormat(format.id));
  }
}

// A6 documents are exactly what they were before formats existed.
{
  const a6 = createDocument("corporativo", ids());
  const title = a6.elements.find((element) => element.role === "titulo");
  assert.ok(title && title.type === "text");
  assert.deepEqual([title.x, title.y, title.width, title.height, title.fontSize], [10, 38, 85, 22, 9]);
  assert.deepEqual([qrOf(a6).x, qrOf(a6).y, qrOf(a6).width], [64, 100, 32]);
  const blank = createBlankDocument(ids());
  assert.deepEqual([qrOf(blank).x, qrOf(blank).y, qrOf(blank).width], [28.5, 52, 48]);
}

// A document cannot claim a format with other dimensions, or an unknown one.
{
  const document = withQr(createDocument("clasico", ids(), "tarjeta"), LINK);
  const forged = JSON.parse(serializeDesign(document)) as { format: Record<string, unknown> };
  forged.format = { id: "tarjeta", widthMm: 850, heightMm: 550 };
  assert.equal(parseDesign(JSON.stringify(forged)), null);
  forged.format = { id: "gigante", widthMm: 85, heightMm: 55 };
  assert.equal(parseDesign(JSON.stringify(forged)), null);
  // Elements are clamped to the document's own sheet, not to A6.
  const moved = updateElement(document, document.elements.find((element) => element.role === "titulo")!.id, { x: 500, y: 500 });
  const title = moved.elements.find((element) => element.role === "titulo")!;
  assert.ok(title.x <= 85 && title.y <= 55);
  const bigQr = updateElement(document, qrOf(document).id, { width: 90, height: 90 });
  assert.equal(qrOf(bigQr).width, qrMaxMm(designFormat("tarjeta")));
  assert.ok(inside(qrOf(bigQr), bigQr));
  // Big sheets allow a bigger code than A6 does.
  const poster = createDocument("negocio", ids(), "a4");
  assert.ok(qrOf(poster).width > 90);
}

// Switching templates on any format keeps content and never piles pieces up.
for (const format of formatList) {
  let document = withQr(createDocument("clasico", ids(), format.id), LINK);
  document = updateElement(document, document.elements.find((element) => element.role === "titulo")!.id, {
    text: "Texto propio",
  });
  document = addText(document, "nota");
  document = updateElement(document, "nota", { text: "Abierto de 9 a 18" });
  document = addRect(document, "forma");
  const png = new PNG({ width: 8, height: 8 });
  const withImage = addImage(document, "logo", `data:image/png;base64,${PNG.sync.write(png).toString("base64")}`, "logo", 8, 8);
  assert.ok(withImage);
  document = withImage;
  for (const id of ["nota", "forma", "logo"]) {
    assert.ok(inside(document.elements.find((element) => element.id === id)!, document), `${format.id}: new ${id} inside`);
  }
  const userIds = ["nota", "forma", "logo"];
  let current = document;
  for (let round = 0; round < 3; round += 1) {
    for (const template of templateList) {
      current = applyTemplate(current, template.id);
      const label = `${format.id}/${template.id}/${round}`;
      assert.deepEqual(current.format, designFormat(format.id), label);
      assert.equal(new Set(current.elements.map((element) => element.id)).size, current.elements.length, label);
      assert.equal(current.elements.filter((element) => element.type === "qr").length, 1, label);
      assert.equal(qrOf(current).value, LINK, label);
      for (const id of userIds) assert.equal(current.elements.filter((element) => element.id === id).length, 1, label);
      assert.equal(current.elements.find((element) => element.id === "nota")?.type, "text");
      assert.equal(current.elements.length, (a6Roles.get(template.id)?.length ?? 0) + userIds.length, label);
      assert.equal(current.parked.length, 0, label);
      assert.equal(offCanvasElements(current).length, 0, label);
      const titles = current.elements.filter((element) => element.role === "titulo");
      assert.equal(titles.length, 1, label);
      assert.equal(titles[0]!.type === "text" && titles[0]!.text, "Texto propio", label);
    }
  }
}

// Changing format moves the whole design: same elements, same content, nothing lost or doubled.
for (const from of formatList) {
  for (const to of formatList) {
    if (from.id === to.id) continue;
    for (const template of templateList) {
      const label = `${template.id}: ${from.id} -> ${to.id}`;
      let document = withQr(createDocument(template.id, ids(), from.id), LINK);
      document = updateElement(document, document.elements.find((element) => element.role === "titulo")!.id, {
        text: "Texto propio",
      });
      document = addText(document, "nota");
      document = updateElement(document, "nota", { text: "Abierto de 9 a 18" });
      const next = changeFormat(document, to.id);
      assert.deepEqual(next.format, designFormat(to.id), label);
      assert.deepEqual(next.elements.map((element) => element.id), document.elements.map((element) => element.id), label);
      assert.equal(next.elements.filter((element) => element.type === "qr").length, 1, label);
      assert.equal(qrOf(next).value, LINK, label);
      for (const element of next.elements) {
        const before = document.elements.find((item) => item.id === element.id)!;
        if (element.type === "text" && before.type === "text") assert.equal(element.text, before.text, label);
        assert.ok(inside(element, next), `${label}: ${element.role ?? element.id} inside`);
      }
      assert.equal(offCanvasElements(next).length, 0, label);
      // Untouched template pieces land exactly where a fresh design of that format has them.
      const fresh = createDocument(template.id, ids(), to.id);
      for (const element of next.elements) {
        if (!element.role || element.type === "text") continue;
        const twin = fresh.elements.find((item) => item.role === element.role && item.type === element.type)!;
        assert.deepEqual([element.x, element.y, element.width, element.height], [twin.x, twin.y, twin.width, twin.height], `${label}: ${element.role}`);
      }
      assert.deepEqual(validateForExport(next, { commercial: true }).errors, [], label);
      assert.ok(parseDesign(serializeDesign(next)), label);
    }
  }
}
assert.equal(changeFormat(createDocument("vivo", ids()), "a6").format.id, "a6");
{
  // A design that does not follow its template (moved pieces) scales in place instead of jumping.
  const document = withQr(createDocument("clasico", ids()), LINK);
  const title = document.elements.find((element) => element.role === "titulo")!;
  const custom = updateElement(document, title.id, { x: 20, y: 100, width: 60 });
  const next = changeFormat(custom, "a4");
  const moved = next.elements.find((element) => element.id === title.id)!;
  assert.deepEqual([moved.x, moved.width], [40, 120]);
  assert.ok(Math.abs(moved.y - 200.68) < 0.5);
  // Parked content travels too.
  const parked = changeFormat({ ...custom, parked: [{ ...title, id: "guardado", role: null }] }, "etiqueta");
  assert.equal(parked.parked.length, 1);
  assert.equal(parked.parked[0]!.id, "guardado");
}

// Each format exports at its real size in the three file types, and the code scans.
const wifi = buildQrContent({ type: "wifi", ssid: "Cafe Centro", password: "cafecito2026", security: "WPA", hidden: false });
const contact = buildQrContent({
  type: "vcard",
  name: "María Fernanda González",
  phone: "+54 9 11 2345 6789",
  email: "maria@estudio.com.ar",
  org: "Estudio González",
  url: "estudiogonzalez.com.ar",
});
const text = buildQrContent({ type: "text", text: "Gracias por tu compra.\nCupón: VUELVO10 ñ á" });
assert.ok(wifi.ok && contact.ok && text.ok);
const payloads = [wifi.value, contact.value, text.value, LINK];

for (const [index, format] of formatList.entries()) {
  const template = templateList[index % templateList.length]!;
  const payload = payloads[index % payloads.length]!;
  const document = withQr(createDocument(template.id, ids(), format.id as FormatId), payload);
  const label = `${template.id}/${format.id}`;

  const png = await exportStudioDesign(document, "png");
  assert.ok(png.ok, label);
  const image = PNG.sync.read(png.body);
  assert.equal(image.width, studioPrintPixels(format.widthMm), label);
  assert.equal(image.height, studioPrintPixels(format.heightMm), label);
  assert.equal(decodePng(png.body), payload, `${label}: QR content`);

  const svg = await exportStudioDesign(document, "svg");
  assert.ok(svg.ok, label);
  const markup = svg.body.toString("utf8");
  assert.ok(markup.includes(`width="${format.widthMm}mm" height="${format.heightMm}mm"`), label);
  assert.ok(markup.includes(`viewBox="0 0 ${format.widthMm} ${format.heightMm}"`), label);

  const pdf = await exportStudioDesign(document, "pdf");
  assert.ok(pdf.ok, label);
  assert.equal(pdf.body.subarray(0, 5).toString("latin1"), "%PDF-", label);
  const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf.body.toString("latin1"));
  assert.ok(box, label);
  assert.ok(Math.abs(Number(box[1]) - (format.widthMm * 72) / 25.4) < 0.01, label);
  assert.ok(Math.abs(Number(box[2]) - (format.heightMm * 72) / 25.4) < 0.01, label);
}

// Wi-Fi, contact and text codes scan on the smallest code the templates use.
for (const payload of payloads) {
  const document = withQr(createDocument("corporativo", ids(), "etiqueta"), payload);
  assert.deepEqual(validateForExport(document, { commercial: true }).errors, []);
  const png = await exportStudioDesign(document, "png");
  assert.ok(png.ok);
  assert.equal(decodePng(png.body), payload);
}

console.log("studio formats checks passed");
