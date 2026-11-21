import assert from "node:assert/strict";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { fitsInMail, renderPurchaseFiles } from "@/lib/purchase-files";
import { studioCommercialFilename } from "@/lib/print/download";
import { buildStudioCommercialArtwork } from "@/lib/studio/commercial-artwork";
import { updateElement } from "@/lib/studio/document";
import { studioPrintPixels } from "@/lib/studio/export/units";
import { createDocument } from "@/lib/studio/templates";
import { A6_HEIGHT_MM, A6_WIDTH_MM } from "@/lib/studio/types";

const LINK = "https://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnop";
const orderId = "dddddddddddddddddddddddd";

let document = createDocument("corporativo");
const qr = document.elements.find((element) => element.type === "qr");
assert.ok(qr);
document = updateElement(document, qr.id, { value: LINK });
const built = buildStudioCommercialArtwork(document);
assert.equal(built.ok, true);
if (!built.ok) throw new Error("build");

function decode(png: Buffer): { link: string | null; width: number; height: number } {
  const image = PNG.sync.read(png);
  const found = jsQR(new Uint8ClampedArray(image.data), image.width, image.height);
  return { link: found?.data ?? null, width: image.width, height: image.height };
}

// The purchase mail carries the same three files the order page serves, under the same names.
const files = await renderPurchaseFiles(built.artwork, orderId);
assert.deepEqual(files.map((file) => file.format), ["png", "pdf", "svg"]);
for (const file of files) {
  assert.equal(file.filename, studioCommercialFilename(built.artwork, file.format));
  assert.ok(file.content.length > 1000, file.filename);
}
assert.equal(fitsInMail(files), true);

const [png, pdf, svg] = files;
assert.equal(png!.contentType, "image/png");
assert.equal(pdf!.contentType, "application/pdf");
assert.equal(svg!.contentType, "image/svg+xml");

// PNG: real size, the QR decodes to the original link.
const expected = { width: studioPrintPixels(A6_WIDTH_MM), height: studioPrintPixels(A6_HEIGHT_MM) };
const fromPng = decode(png!.content);
assert.equal(fromPng.link, LINK);
assert.deepEqual({ width: fromPng.width, height: fromPng.height }, expected);

// SVG: a valid document that renders to the same pixels and decodes to the same link.
const svgText = svg!.content.toString("utf8");
assert.ok(svgText.includes("<svg"));
const rendered = new Resvg(svgText, { fitTo: { mode: "width", value: expected.width } }).render();
const fromSvg = decode(Buffer.from(rendered.asPng()));
assert.equal(fromSvg.link, LINK);
assert.equal(fromSvg.height, expected.height);

// PDF: valid header and trailer, one page.
assert.equal(pdf!.content.subarray(0, 5).toString("latin1"), "%PDF-");
assert.ok(pdf!.content.subarray(-32).toString("latin1").includes("%%EOF"));
assert.equal((pdf!.content.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length, 1);

// An unreadable snapshot never produces a partial set.
await assert.rejects(() => renderPurchaseFiles({ ...built.artwork, version: 999 } as never, orderId));

// Oversize sets are told apart.
assert.equal(fitsInMail([{ content: Buffer.alloc(16 * 1024 * 1024) }]), false);

console.log("purchase files checks passed");
