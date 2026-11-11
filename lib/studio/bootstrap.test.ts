import assert from "node:assert/strict";
import { resolveStudioBootstrap, studioBootKey } from "@/lib/studio/bootstrap";
import { createDocument } from "@/lib/studio/templates";
import { STUDIO_STORAGE_KEY, type StorageLike } from "@/lib/studio/persistence";
import { serializeDesign } from "@/lib/studio/serialize";
import { getInspiration } from "@/lib/studio/inspiration";

function memoryStorage(seed?: Record<string, string>): StorageLike & { data: Record<string, string> } {
  const data = { ...(seed ?? {}) };
  return {
    data,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key]! : null;
    },
    setItem(key, value) {
      data[key] = value;
    },
  };
}

const clasico = createDocument("clasico");
const taller = getInspiration("taller");
assert.ok(taller);
const cafeteria = getInspiration("cafeteria");
assert.ok(cafeteria);

// Explicit inspiration wins over a saved session (the reported production bug).
{
  const storage = memoryStorage({
    [STUDIO_STORAGE_KEY]: serializeDesign(clasico),
  });
  const boot = resolveStudioBootstrap({
    search: "?inspiracion=taller",
    storage,
  });
  assert.equal(boot.source, "inspiration");
  assert.equal(boot.started, true);
  assert.equal(boot.recovered, false);
  assert.match(boot.saveLabel, /Automotor/);
  const title = boot.document.elements.find((el) => el.type === "text" && el.role === "titulo");
  assert.ok(title && title.type === "text");
  assert.equal(title.text, "Auto Norte");
  assert.notEqual(title.text, "Tu negocio");
}

// Switching inspiration IDs replaces the previous inspiration session.
{
  const storage = memoryStorage({
    [STUDIO_STORAGE_KEY]: serializeDesign(cloneDoc(cafeteria.document)),
  });
  const boot = resolveStudioBootstrap({
    search: "inspiracion=taller",
    storage,
  });
  assert.equal(boot.source, "inspiration");
  const title = boot.document.elements.find((el) => el.type === "text" && el.role === "titulo");
  assert.ok(title && title.type === "text");
  assert.equal(title.text, "Auto Norte");
}

// Invalid inspiration falls through to the saved session.
{
  const storage = memoryStorage({
    [STUDIO_STORAGE_KEY]: serializeDesign(clasico),
  });
  const boot = resolveStudioBootstrap({
    search: "?inspiracion=no-existe",
    storage,
  });
  assert.equal(boot.source, "session");
  assert.equal(boot.recovered, true);
  assert.match(boot.saveLabel, /Recuperamos/);
}

// No query recovers the session.
{
  const storage = memoryStorage({
    [STUDIO_STORAGE_KEY]: serializeDesign(clasico),
  });
  const boot = resolveStudioBootstrap({ search: "", storage });
  assert.equal(boot.source, "session");
  assert.equal(boot.started, true);
}

// Empty storage without query stays on the welcome/blank path.
{
  const storage = memoryStorage();
  const boot = resolveStudioBootstrap({ search: "?", storage });
  assert.equal(boot.source, "blank");
  assert.equal(boot.started, false);
}

// Template query wins over session.
{
  const storage = memoryStorage({
    [STUDIO_STORAGE_KEY]: serializeDesign(clasico),
  });
  const boot = resolveStudioBootstrap({
    search: "?plantilla=vivo",
    storage,
  });
  assert.equal(boot.source, "template");
  assert.equal(boot.document.templateId, "vivo");
}

// A proposal picked in the guided flow arrives as the session design, in its own format.
{
  const card = createDocument("corporativo", undefined, "tarjeta");
  const storage = memoryStorage({ [STUDIO_STORAGE_KEY]: serializeDesign(card) });
  const boot = resolveStudioBootstrap({ search: "?origen=guiado", storage });
  assert.equal(boot.source, "session");
  assert.equal(boot.started, true);
  assert.deepEqual(boot.document, card);
  assert.match(boot.saveLabel, /propuesta/);
  // Without a saved design the editor shows its start screen instead of an empty piece.
  assert.equal(resolveStudioBootstrap({ search: "?origen=guiado", storage: memoryStorage() }).started, false);
}
assert.equal(studioBootKey("?origen=guiado"), "session");

assert.equal(studioBootKey("?inspiracion=taller"), "inspiration:taller");
assert.equal(studioBootKey("?inspiracion=nope"), "session");
assert.equal(studioBootKey("?plantilla=vivo"), "template:vivo");
assert.equal(studioBootKey(""), "session");
assert.notEqual(studioBootKey("?inspiracion=taller"), studioBootKey("?inspiracion=cafeteria"));

console.log("studio bootstrap tests ok");

function cloneDoc(document: ReturnType<typeof createDocument>) {
  return structuredClone(document);
}
