import assert from "node:assert/strict";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { parseOrderDraft } from "@/lib/order-draft";
import { buildQrContent, qrContentTypes, type QrContentInput } from "@/lib/qr-content";
import { createStudioDraftKey } from "@/lib/studio/assets/index";
import { offCanvasElements } from "@/lib/studio/canvas-space";
import { buildStudioCommercialArtwork } from "@/lib/studio/commercial-artwork";
import { compileStudioScene } from "@/lib/studio/export/compile";
import { exportStudioDesign } from "@/lib/studio/export/index";
import { renderStudioPreviewPng } from "@/lib/studio/export/render";
import { validateForExport } from "@/lib/studio/export/validate";
import { wrapStudioText } from "@/lib/studio/export/wrap";
import { designFormat, formatList } from "@/lib/studio/formats";
import type { IdFactory } from "@/lib/studio/ids";
import { createStudioOrderIdempotencyKey } from "@/lib/studio/order-idempotency";
import { recommendedStyle, styleList } from "@/lib/studio/proposal-options";
import { buildProposals } from "@/lib/studio/proposals";
import { templateColors } from "@/lib/studio/template-colors";
import { parseDesign, serializeDesign } from "@/lib/studio/serialize";
import { applyTemplate, templateList } from "@/lib/studio/templates";
import type { DesignDocumentV8 } from "@/lib/studio/types";
import { elementsCoveringQr, validateDesign } from "@/lib/studio/validation";

function ids(): IdFactory {
  let n = 0;
  return (prefix) => `${prefix}-${++n}`;
}

function qrValue(document: DesignDocumentV8): string {
  const qr = document.elements.find((element) => element.type === "qr");
  assert.ok(qr && qr.type === "qr");
  return qr.value;
}

const contents: QrContentInput[] = [
  { type: "url", url: "midominio.com.ar/promociones" },
  { type: "social", network: "instagram", handle: "@cafe.martinez" },
  { type: "social", network: "tiktok", handle: "cafemartinez" },
  { type: "whatsapp", phone: "+54 9 11 2345 6789", message: "¡Hola! Quiero hacer un pedido" },
  { type: "maps", url: "https://maps.app.goo.gl/AbCdEfGh12345" },
  { type: "review", url: "https://g.page/r/CQpXgZ1aBcDeEAE/review" },
  { type: "menu", kind: "menu", url: "https://cafemartinez.com/carta" },
  { type: "menu", kind: "catalogo", url: "https://tienda.example.com/catalogo.pdf" },
  { type: "event", url: "https://eventos.example.com/fiesta-de-la-primavera" },
  { type: "wifi", ssid: "Cafe Martinez Clientes", password: "cafecito2026", security: "WPA", hidden: false },
  {
    type: "vcard",
    name: "María Fernanda González",
    phone: "+54 9 11 2345 6789",
    email: "maria@estudio.com.ar",
    org: "Estudio González",
    url: "estudiogonzalez.com.ar",
  },
  { type: "text", text: "Gracias por tu compra. Guardá este cupón: VUELVO10" },
];
assert.deepEqual([...new Set(contents.map((content) => content.type))].sort(), qrContentTypes.map((type) => type.id).sort());

const NAMES = ["", "Café Martínez", "Distribuidora Hermanos Rodríguez y Asoc."];

let built = 0;
for (const content of contents) {
  const expected = buildQrContent(content);
  assert.ok(expected.ok);
  for (const format of formatList) {
    for (const style of styleList) {
      for (const name of NAMES) {
        const label = `${content.type}/${format.id}/${style.id}/"${name}"`;
        const request = { content, name, styleId: style.id, formatId: format.id };
        const result = buildProposals(request, ids());
        assert.ok(result.ok, `${label}: ${result.ok ? "" : result.message}`);
        // Enough real choices on every format, each a different composition.
        assert.ok(result.proposals.length >= 4, `${label}: only ${result.proposals.length} proposals`);
        assert.equal(new Set(result.proposals.map((proposal) => proposal.templateId)).size, result.proposals.length, label);
        assert.equal(new Set(result.proposals.map((proposal) => proposal.id)).size, result.proposals.length, label);

        for (const proposal of result.proposals) {
          const at = `${label}/${proposal.templateId}`;
          const document = proposal.document;
          built += 1;
          assert.deepEqual(document.format, designFormat(format.id), at);
          assert.equal(document.templateId, proposal.templateId, at);
          assert.equal(qrValue(document), expected.value, at);

          // Ready to order as it is: valid content, scannable size, nothing over the code or off the sheet.
          const validation = validateForExport(document, { commercial: true });
          assert.deepEqual(validation.errors, [], at);
          assert.deepEqual(elementsCoveringQr(document), [], at);
          assert.equal(offCanvasElements(document).length, 0, at);
          // Every text reads well on what is behind it.
          assert.deepEqual(
            validateDesign(document).warnings.filter((warning) => warning.code.startsWith("text-contrast")),
            [],
            at,
          );

          for (const element of document.elements) {
            if (element.type !== "text") continue;
            assert.ok(element.text.trim().length > 0, `${at}: empty ${element.role}`);
            // Nothing is cut: every wrapped line fits inside its box with the print metrics.
            const wrapped = wrapStudioText({ ...element, width: element.width });
            assert.ok(
              wrapped.lines.length * wrapped.lineHeight <= element.height + 0.01,
              `${at}: ${element.role} "${element.text}" needs ${wrapped.lines.length} lines of ${wrapped.lineHeight}mm in ${element.height}mm`,
            );
            assert.ok(element.fontSize >= 2, at);
          }

          // The name the user typed is on the piece.
          if (name && content.type !== "vcard") {
            assert.ok(
              document.elements.some(
                (element) => element.type === "text" && element.text.toLowerCase().includes(name.toLowerCase()),
              ),
              `${at}: name missing`,
            );
          }

          // It is a normal Studio document: saved sessions read it back identical.
          const parsed = parseDesign(serializeDesign(document));
          assert.ok(parsed, at);
          assert.deepEqual(parsed.document, document, at);
        }

        // Deterministic: the same answers give the same designs.
        assert.deepEqual(buildProposals(request, ids()), result, label);
      }
    }
  }
}
assert.ok(built > 5000);

// Styles really change the colors, and the two tones of a style differ.
for (const template of templateList) {
  const seen = new Set<string>();
  for (const style of styleList) {
    for (const tone of style.tones) seen.add(JSON.stringify(templateColors(template.id, tone)));
  }
  assert.equal(seen.size, styleList.length * 2, template.id);
}
for (const type of qrContentTypes) {
  assert.ok(styleList.some((style) => style.id === recommendedStyle(type.id)));
}

// Proposals for different goals do not share wording.
{
  const titles = (content: QrContentInput) => {
    const result = buildProposals({ content, name: "", styleId: "clasico", formatId: "a6" }, ids());
    assert.ok(result.ok);
    return result.proposals.map(
      (proposal) => proposal.document.elements.find((element) => element.role === "titulo" && element.type === "text"),
    ).map((element) => (element?.type === "text" ? element.text : ""));
  };
  const wifi = titles(contents[9]!);
  const review = titles(contents[5]!);
  assert.ok(wifi.every((title) => /wi-fi/i.test(title)));
  assert.ok(wifi.every((title) => !review.includes(title)));
  assert.ok(new Set(review).size >= 3);
}

// Invalid data never becomes a design; the error points at the field.
{
  const bad = buildProposals(
    { content: { type: "whatsapp", phone: "011 2345", message: "" }, name: "", styleId: "vivo", formatId: "a6" },
    ids(),
  );
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.field, "phone");

  // Content too long for a small piece: no broken proposals, a clear way out instead.
  const long = { type: "url" as const, url: `https://example.com/${"camino-largo/".repeat(36)}` };
  assert.ok(buildQrContent(long).ok);
  const small = buildProposals({ content: long, name: "", styleId: "vivo", formatId: "etiqueta" }, ids());
  assert.equal(small.ok, false);
  if (!small.ok) {
    assert.equal(small.field, "format");
    assert.match(small.message, /formato más grande/);
  }
  const large = buildProposals({ content: long, name: "", styleId: "vivo", formatId: "a4" }, ids());
  assert.ok(large.ok && large.proposals.length >= 4);
}

// From proposal to order and files: Wi-Fi, contact and text go through the paid pipeline and scan.
for (const [content, formatId] of [
  [contents[9]!, "a6"],
  [contents[10]!, "tarjeta"],
  [contents[11]!, "etiqueta"],
  [contents[3]!, "historia"],
] as const) {
  const expected = buildQrContent(content);
  assert.ok(expected.ok);
  const result = buildProposals({ content, name: "Café Martínez", styleId: recommendedStyle(content.type), formatId }, ids());
  assert.ok(result.ok);
  for (const proposal of result.proposals) {
    const at = `${content.type}/${formatId}/${proposal.templateId}`;
    const artwork = buildStudioCommercialArtwork(proposal.document);
    assert.ok(artwork.ok, at);
    assert.equal(artwork.artwork.href, expected.value, at);
    const order = parseOrderDraft(
      {
        version: 8,
        email: "cliente@example.com",
        document: proposal.document,
        idempotencyKey: createStudioOrderIdempotencyKey(),
      },
      { studioDraftKey: createStudioDraftKey() },
    );
    assert.ok(order.ok, `${at}: ${order.ok ? "" : order.error}`);

    const png = await exportStudioDesign(proposal.document, "png");
    assert.ok(png.ok, at);
    const image = PNG.sync.read(png.body);
    assert.equal(jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data, expected.value, at);
    assert.ok((await exportStudioDesign(proposal.document, "svg")).ok, at);
    assert.ok((await exportStudioDesign(proposal.document, "pdf")).ok, at);

    const preview = PNG.sync.read(renderStudioPreviewPng(compileStudioScene(proposal.document), 520));
    assert.equal(preview.width, 520, at);
    assert.ok(Math.abs(preview.height - (520 * proposal.document.format.heightMm) / proposal.document.format.widthMm) <= 1, at);
  }

  // A proposal is fully editable: other templates take its content without loss or pile-ups.
  let document = result.proposals[0]!.document;
  const count = (current: DesignDocumentV8) => current.elements.filter((element) => element.type === "qr").length;
  for (const template of [...templateList, ...templateList]) {
    document = applyTemplate(document, template.id);
    assert.equal(count(document), 1);
    assert.equal(qrValue(document), expected.value);
    assert.equal(document.parked.length, 0);
    assert.equal(offCanvasElements(document).length, 0);
    assert.equal(new Set(document.elements.map((element) => element.id)).size, document.elements.length);
    assert.ok(document.elements.length <= 13);
  }
}

console.log(`studio proposals checks passed (${built} designs)`);
