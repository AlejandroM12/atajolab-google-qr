import assert from "node:assert/strict";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { buildQrContent, type QrContentInput } from "@/lib/qr-content";
import {
  isSealed,
  needsSeal,
  openStudioArtwork,
  openText,
  sealStudioArtwork,
  sealText,
} from "@/lib/studio/artwork-seal";
import { resolveStudioBootstrap } from "@/lib/studio/bootstrap";
import { buildStudioCommercialArtwork, readStudioCommercialArtwork } from "@/lib/studio/commercial-artwork";
import { compileStudioScene } from "@/lib/studio/export/compile";
import { exportStudioDesign } from "@/lib/studio/export/index";
import { renderStudioPreviewPng } from "@/lib/studio/export/render";
import { validateForExport } from "@/lib/studio/export/validate";
import { formatList } from "@/lib/studio/formats";
import {
  GUIDED_STEPS,
  STUDIO_PREVIOUS_KEY,
  handoffProposal,
  initialGuidedState,
  reachableStep,
  readGuidedState,
  selectedProposal,
  serializeGuidedState,
  takePreviousDesign,
  type GuidedState,
} from "@/lib/studio/guided";
import { historyFrom, undo } from "@/lib/studio/history";
import { STUDIO_STORAGE_KEY, type StorageLike } from "@/lib/studio/persistence";
import { buildProposals } from "@/lib/studio/proposals";
import { parseDesign, serializeDesign } from "@/lib/studio/serialize";
import { createDocument, templateList } from "@/lib/studio/templates";
import type { DesignDocumentV8 } from "@/lib/studio/types";

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  fail = false;
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.fail) throw new Error("quota");
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const wifi: QrContentInput = { type: "wifi", ssid: "Cafe Centro", password: "clave-super-secreta", security: "WPA", hidden: false };
const instagram: QrContentInput = { type: "social", network: "instagram", handle: "@cafe.centro" };

function qrValue(document: DesignDocumentV8): string {
  const qr = document.elements.find((element) => element.type === "qr");
  assert.ok(qr && qr.type === "qr");
  return qr.value;
}

/* ---------- The last step: proposals, default selection, "Usar este diseño" ---------- */

assert.deepEqual([...GUIDED_STEPS], ["Contenido", "Datos", "Estilo", "Formato", "Diseño"]);

const result = buildProposals({ content: instagram, name: "Café Centro", styleId: "vivo", formatId: "post" });
assert.ok(result.ok);
const proposals = result.proposals;
assert.equal(proposals.length, 6);

// With proposals available one is always selected: the first (best match) unless the user chose another.
assert.equal(selectedProposal(proposals, null)?.id, proposals[0]!.id);
assert.equal(selectedProposal(proposals, "no-existe")?.id, proposals[0]!.id);
assert.equal(selectedProposal(proposals, proposals[3]!.id)?.id, proposals[3]!.id);
assert.equal(selectedProposal([], null), null);

// "Usar este diseño" saves exactly the selected document, and the editor opens it.
for (const [index, proposal] of proposals.entries()) {
  const storage = new MemoryStorage();
  // The document travels as JSON from the API, like in the browser.
  const fromApi = JSON.parse(JSON.stringify(selectedProposal(proposals, proposal.id)!.document)) as unknown;
  assert.deepEqual(handoffProposal(storage, fromApi), { ok: true, replaced: false });
  assert.deepEqual(parseDesign(storage.getItem(STUDIO_STORAGE_KEY)!)?.document, proposal.document);
  assert.equal(storage.getItem(STUDIO_PREVIOUS_KEY), null);

  const boot = resolveStudioBootstrap({ search: "?origen=guiado", storage });
  assert.equal(boot.started, true, `proposal ${index} opens the editor, not its start screen`);
  assert.equal(boot.source, "session");
  assert.deepEqual(boot.document, proposal.document);
  assert.equal(boot.previous, null);
  assert.match(boot.saveLabel, /Tu diseño está listo/);
  assert.equal(boot.document.templateId, proposal.templateId);
  assert.equal(boot.document.format.id, "post");
  assert.equal(qrValue(boot.document), "https://www.instagram.com/cafe.centro/");
  // Ready to download as it arrives: nothing left to fix first.
  assert.deepEqual(validateForExport(boot.document, { commercial: true }).errors, []);
  // A reload of the editor keeps it.
  assert.deepEqual(resolveStudioBootstrap({ search: "", storage }).document, proposal.document);
}

// Choosing a proposal over an existing design needs no confirmation: the old one is one Undo away.
{
  const storage = new MemoryStorage();
  const mine = createDocument("negocio");
  storage.setItem(STUDIO_STORAGE_KEY, serializeDesign(mine));
  assert.deepEqual(handoffProposal(storage, proposals[1]!.document), { ok: true, replaced: true });
  const boot = resolveStudioBootstrap({ search: "?origen=guiado", storage });
  assert.deepEqual(boot.document, proposals[1]!.document);
  assert.deepEqual(boot.previous, mine);
  assert.match(boot.saveLabel, /Deshacer/);
  // What the editor does with it: the previous design sits in the history.
  const history = { past: [boot.previous!], present: boot.document, future: [] };
  assert.deepEqual(undo(history).present, mine);
  assert.equal(undo(historyFrom(boot.document)).present, boot.document);
  // It is offered once; a later reload starts a normal session.
  assert.equal(storage.getItem(STUDIO_PREVIOUS_KEY), null);
  assert.equal(resolveStudioBootstrap({ search: "?origen=guiado", storage }).previous, null);
  // Opening the editor any other way does not consume or show it.
  handoffProposal(storage, proposals[2]!.document);
  assert.equal(resolveStudioBootstrap({ search: "", storage }).previous, null);
  assert.ok(takePreviousDesign(storage));
  // Picking the same design again does not count as replacing anything.
  assert.deepEqual(handoffProposal(storage, proposals[2]!.document), { ok: true, replaced: false });
}

// A broken document or a browser that refuses to store never navigates to an empty editor.
{
  const storage = new MemoryStorage();
  assert.deepEqual(handoffProposal(storage, { version: 8 }), { ok: false, reason: "invalid" });
  assert.deepEqual(handoffProposal(storage, null), { ok: false, reason: "invalid" });
  assert.equal(storage.getItem(STUDIO_STORAGE_KEY), null);
  storage.fail = true;
  assert.deepEqual(handoffProposal(storage, proposals[0]!.document), { ok: false, reason: "storage" });
}

/* ---------- Saved answers ---------- */

{
  const state: GuidedState = { ...initialGuidedState(), step: 4, content: instagram, name: "Café Centro", styleId: "vivo", stylePicked: true, formatId: "historia", proposalId: "historia-vivo-creativo" };
  assert.deepEqual(readGuidedState(serializeGuidedState(state)), state);
  assert.equal(reachableStep(state), 4);
  assert.equal(reachableStep(initialGuidedState()), 0);
  assert.equal(reachableStep({ content: { type: "url", url: "" } }), 1);

  // The Wi-Fi password is never written to storage; after a reload the flow asks for it again.
  const withWifi: GuidedState = { ...state, content: wifi };
  const saved = serializeGuidedState(withWifi);
  assert.equal(saved.includes("clave-super-secreta"), false);
  assert.ok(saved.includes("Cafe Centro"));
  const restored = readGuidedState(saved);
  assert.equal(restored.step, 1);
  assert.deepEqual(restored.content, { ...wifi, password: "" });
  assert.equal(restored.formatId, "historia");
  // An open network has no password to lose and resumes where it was.
  const open: GuidedState = { ...state, content: { ...wifi, security: "nopass", password: "" } };
  assert.equal(readGuidedState(serializeGuidedState(open)).step, 4);

  // Damaged or foreign data starts over instead of breaking the page.
  for (const raw of [null, "", "{", "[]", '{"step":9}', '{"content":{"type":"nada"}}']) {
    assert.deepEqual(readGuidedState(raw), initialGuidedState());
  }
  const odd = readGuidedState(JSON.stringify({ content: instagram, step: 99, styleId: "x", formatId: "a3", name: 5 }));
  assert.equal(odd.step, 1);
  assert.equal(odd.styleId, "vivo");
  assert.equal(odd.formatId, "a6");
  assert.equal(odd.name, "");
}

/* ---------- The six proposals really look different ---------- */

function pixels(document: DesignDocumentV8): PNG {
  return PNG.sync.read(renderStudioPreviewPng(compileStudioScene(document), 120));
}

/** Share of pixels that clearly differ between two previews of the same size. */
function difference(a: PNG, b: PNG): number {
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  let changed = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    const delta =
      Math.abs(a.data[index]! - b.data[index]!) +
      Math.abs(a.data[index + 1]! - b.data[index + 1]!) +
      Math.abs(a.data[index + 2]! - b.data[index + 2]!);
    if (delta > 96) changed += 1;
  }
  return changed / (a.width * a.height);
}

for (const format of formatList) {
  // Same style and content, so any difference comes from the composition, not from the palette.
  const set = buildProposals({ content: instagram, name: "Café Centro", styleId: "profesional", formatId: format.id });
  assert.ok(set.ok);
  assert.equal(set.proposals.length, 6, format.id);
  const renders = set.proposals.map((proposal) => ({ id: proposal.templateId, image: pixels(proposal.document) }));
  for (let a = 0; a < renders.length; a += 1) {
    for (let b = a + 1; b < renders.length; b += 1) {
      const share = difference(renders[a]!.image, renders[b]!.image);
      assert.ok(share > 0.15, `${format.id}: ${renders[a]!.id} and ${renders[b]!.id} look alike (${share.toFixed(2)})`);
    }
  }

  // Each template has its own structure: where the code sits, how big it is, which pieces it uses.
  const shapes = set.proposals.map((proposal) => {
    const qr = proposal.document.elements.find((element) => element.type === "qr")!;
    return [Math.round(qr.x), Math.round(qr.y), Math.round(qr.width)].join("/");
  });
  assert.ok(new Set(shapes).size >= 3, `${format.id}: code placement ${shapes.join(" ")}`);
  const roles = set.proposals.map((proposal) =>
    proposal.document.elements
      .filter((element) => element.type === "rect")
      .map((element) => element.role)
      .sort()
      .join(","),
  );
  assert.equal(new Set(roles).size, 6, `${format.id}: every template has its own shapes`);
}
// Typography is part of the identity too.
{
  const fonts = templateList.map((template) => {
    const title = createDocument(template.id).elements.find((element) => element.role === "titulo");
    assert.ok(title && title.type === "text");
    return `${title.font}/${title.fontSize}/${title.align}/${title.rotation}`;
  });
  assert.equal(new Set(fonts).size, 6);
}

/* ---------- From the chosen proposal to the files ---------- */

for (const content of [wifi, instagram]) {
  const expected = buildQrContent(content);
  assert.ok(expected.ok);
  const set = buildProposals({ content, name: "Café Centro", styleId: "clasico", formatId: "a6" });
  assert.ok(set.ok);
  const storage = new MemoryStorage();
  handoffProposal(storage, set.proposals[0]!.document);
  const opened = resolveStudioBootstrap({ search: "?origen=guiado", storage }).document;

  for (const format of ["png", "svg", "pdf"] as const) {
    const file = await exportStudioDesign(opened, format);
    assert.ok(file.ok, format);
    if (format === "png") {
      const image = PNG.sync.read(file.body);
      assert.equal(jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data, expected.value);
    }
  }

  // The order snapshot, sealed for the database and opened again, is the same order.
  const artwork = buildStudioCommercialArtwork(opened);
  assert.ok(artwork.ok);
  const secret = "test-secret-0123456789abcdef0123456789abcdef";
  const stored = JSON.parse(JSON.stringify(sealStudioArtwork(artwork.artwork, secret))) as Record<string, unknown>;
  const text = JSON.stringify(stored);
  if (content.type === "wifi") {
    assert.equal(text.includes("clave-super-secreta"), false);
    assert.equal(text.includes("WIFI:"), false);
    assert.ok(isSealed(stored.href as string));
    // Without the right secret the order does not open at all: it is never drawn with the ciphertext as its code.
    assert.equal(openStudioArtwork(stored, null), null);
    assert.equal(openStudioArtwork(stored, "another-secret-0123456789abcdef0123456789"), null);
  } else {
    assert.deepEqual(stored, JSON.parse(JSON.stringify(artwork.artwork)));
  }
  assert.deepEqual(readStudioCommercialArtwork(openStudioArtwork(stored, secret)), artwork.artwork);
  // Sealing is stable, so retrying the same order stores the same value.
  assert.deepEqual(sealStudioArtwork(artwork.artwork, secret), sealStudioArtwork(artwork.artwork, secret));
}

{
  const secret = "test-secret-0123456789abcdef0123456789abcdef";
  assert.equal(needsSeal("https://example.com/a"), false);
  assert.equal(needsSeal("WIFI:T:WPA;S:x;P:12345678;;"), true);
  assert.equal(needsSeal("BEGIN:VCARD\nFN:Ana\nEND:VCARD"), true);
  assert.equal(needsSeal("Cupón VUELVO10"), true);
  const sealed = sealText("Cupón VUELVO10 ñ", secret);
  assert.equal(needsSeal(sealed), false);
  assert.equal(openText(sealed, secret), "Cupón VUELVO10 ñ");
  assert.equal(openText(sealed, `${secret}x`), null);
  assert.equal(openText(`${sealed.slice(0, -2)}AA`, secret), null);
  assert.equal(openText("https://example.com", secret), null);
  // Orders stored before sealing existed, and legacy artwork, pass through untouched.
  const legacy = { version: 1, href: "https://example.com", businessName: "x" };
  assert.equal(openStudioArtwork(legacy, secret), legacy);
  assert.equal(sealStudioArtwork(legacy, secret), legacy);
  assert.equal(openStudioArtwork(null, secret), null);
}

// Saved designs from before this change still open (same parser, same fonts and sizes).
{
  const old = {
    version: 8,
    format: { id: "a6", widthMm: 105, heightMm: 148 },
    background: "#fffcf8",
    templateId: "clasico",
    layouts: {},
    elements: [
      { id: "t", role: "titulo", type: "text", x: 10, y: 24, width: 85, height: 18, rotation: 0, text: "Tu opinión nos importa", font: "fraunces", fontSize: 7, fill: "#1c1915", align: "center" },
      { id: "m", role: "marco", type: "rect", x: 22, y: 52, width: 61, height: 61, rotation: 0, fill: "#1c1915", cornerRadius: 0 },
      { id: "q", role: "qr", type: "qr", x: 26.5, y: 56.5, width: 52, height: 52, rotation: 0, value: "https://example.com", foreground: "#14221f", background: "#ffffff" },
    ],
    parked: [],
  };
  const parsed = parseDesign(JSON.stringify(old));
  assert.ok(parsed);
  assert.deepEqual(parsed.document, old);
  assert.equal(validateForExport(parsed.document, { commercial: true }).ready, true);
}

console.log("guided flow checks passed");
