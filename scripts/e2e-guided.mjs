/**
 * Browser test of the guided flow and the editor, on a phone and on a desktop.
 *
 * Needs the built app running and a Chromium for playwright-core:
 *   pnpm build && pnpm start            (in another terminal)
 *   pnpm exec playwright-core install chromium
 *   E2E_BASE_URL=http://localhost:3000 pnpm test:e2e
 *
 * Optional:
 *   E2E_CHROME=<path to chrome>   use an installed browser instead
 *   E2E_SHOTS=<folder>            save screenshots of each step
 *   E2E_ORDER=1                   also place a free order and download the files
 *                                 (local only: needs FREE_FIRST_QR_ENABLED=true)
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const base = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const shots = process.env.E2E_SHOTS ?? "";
if (shots) mkdirSync(shots, { recursive: true });

const STUDIO_KEY = "atajolab.studio.v8";
const GUIDED_KEY = "atajolab.guiado.v2";

const browser = await chromium.launch(
  process.env.E2E_CHROME ? { executablePath: process.env.E2E_CHROME } : {},
);
const problems = [];

function watch(page, label) {
  page.on("pageerror", (error) => problems.push(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource/.test(message.text())) {
      problems.push(`${label}: ${message.text()}`);
    }
  });
}

async function shot(page, name) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false });
}

async function stored(page, key) {
  const raw = await page.evaluate((item) => window.sessionStorage.getItem(item), key);
  return raw ? JSON.parse(raw) : null;
}

/** The element is fully inside the visible screen: the user can see and tap it without scrolling. */
async function assertOnScreen(page, locator, label) {
  await locator.waitFor({ state: "visible" });
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(box, `${label}: no box`);
  assert.ok(box.y >= 0 && box.y + box.height <= viewport.height + 1, `${label}: outside the screen vertically`);
  assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1, `${label}: outside the screen horizontally`);
  assert.ok(box.height >= 44, `${label}: too small to tap (${box.height}px)`);
  return box;
}

async function assertNoSideScroll(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `${label}: page scrolls sideways by ${overflow}px`);
}

async function waitForDesigns(page) {
  const radios = page.getByRole("radio");
  await radios.first().waitFor({ timeout: 30000 });
  assert.equal(await radios.count(), 6, "six proposals");
  return radios;
}

/* ------------------------------------------------------------------ */
/* Phone                                                               */
/* ------------------------------------------------------------------ */
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  watch(page, "phone");

  // The home page shows real examples of several uses.
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  const examples = page.locator("#ejemplos img");
  assert.equal(await examples.count(), 6);
  assert.ok(await page.getByText("Perfil de Instagram").first().isVisible());
  await assertNoSideScroll(page, "home");
  await shot(page, "phone-0-home");

  // Step 1: content.
  await page.getByRole("link", { name: "Crear mi QR" }).first().click();
  await page.getByRole("heading", { name: "¿Qué querés compartir?" }).waitFor();
  await assertNoSideScroll(page, "step 1");
  await shot(page, "phone-1-contenido");
  await page.getByRole("button", { name: /Instagram, TikTok y redes/ }).tap();

  // Step 2: data, with the code shown as soon as it is valid.
  await page.getByRole("heading", { name: "¿Cuál es tu perfil?" }).waitFor();
  const next = page.getByTestId("accion-principal");
  await assertOnScreen(page, next, "phone Continuar");
  await next.tap();
  await page.locator('p[role="alert"]').waitFor();
  await page.getByLabel(/Usuario o enlace/).fill("@cafe.centro");
  await page.getByLabel(/Nombre de tu negocio/).fill("Café Centro");
  await page.getByText("Tu código ya funciona").waitFor();
  await shot(page, "phone-2-datos");
  await next.tap();

  // Step 3: style, with samples of the user's own content.
  await page.getByRole("heading", { name: "Elegí un estilo" }).waitFor();
  await page.locator('button[aria-pressed] img[src^="data:image/png"]').first().waitFor({ timeout: 30000 });
  await assertNoSideScroll(page, "step 3");
  await shot(page, "phone-3-estilo");
  await page.getByRole("button", { name: /Vivo/ }).tap();

  // Step 4: format.
  await page.getByRole("heading", { name: "¿Dónde lo vas a usar?" }).waitFor();
  await shot(page, "phone-4-formato");
  await page.getByRole("button", { name: /Redes sociales/ }).tap();

  // Step 5: proposals, one selected by default, the main action fixed on screen.
  await page.getByRole("heading", { name: "Elegí tu diseño" }).waitFor();
  const radios = await waitForDesigns(page);
  assert.equal(await radios.nth(0).getAttribute("aria-checked"), "true", "first proposal selected by default");
  assert.equal(await page.getByRole("radio", { checked: true }).count(), 1);
  const chosen = page.getByTestId("diseno-elegido");
  await chosen.waitFor();
  const firstName = (await radios.nth(0).getAttribute("aria-label")).replace("Diseño ", "");
  assert.equal(await chosen.getAttribute("alt"), `Diseño ${firstName} con tu código`);
  const use = page.getByTestId("accion-principal");
  assert.equal((await use.innerText()).trim(), "Usar este diseño");
  assert.equal(await use.isEnabled(), true);
  const useBox = await assertOnScreen(page, use, "phone Usar este diseño");
  assert.ok(useBox.width >= 240 && useBox.height >= 52, "the main action is large");
  // It stays on screen wherever the page is scrolled.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await assertOnScreen(page, use, "phone Usar este diseño after scrolling");
  await page.evaluate(() => window.scrollTo(0, 0));
  await assertNoSideScroll(page, "step 5");
  await shot(page, "phone-5-disenos");

  // Selecting another one is visible and remembered.
  await radios.nth(2).tap();
  assert.equal(await radios.nth(2).getAttribute("aria-checked"), "true");
  assert.equal(await radios.nth(0).getAttribute("aria-checked"), "false");
  const pickedName = (await radios.nth(2).getAttribute("aria-label")).replace("Diseño ", "");
  await page.locator(`img[alt="Diseño ${pickedName} con tu código"]`).waitFor();
  await shot(page, "phone-5-otro");
  await page.reload({ waitUntil: "networkidle" });
  await waitForDesigns(page);
  assert.equal(await page.getByRole("radio").nth(2).getAttribute("aria-checked"), "true", "selection survives a reload");

  // "Usar este diseño" opens the editor with exactly that design.
  const guided = await stored(page, GUIDED_KEY);
  await page.getByTestId("accion-principal").tap();
  await page.waitForURL(/\/crear\?origen=guiado/);
  await page.getByRole("heading", { name: "Tu diseño" }).waitFor();
  await page.locator("canvas").first().waitFor();
  const design = await stored(page, STUDIO_KEY);
  assert.equal(design.format.id, "post");
  assert.equal(guided.proposalId, `post-vivo-${design.templateId}`);
  assert.equal(design.elements.find((element) => element.type === "qr").value, "https://www.instagram.com/cafe.centro/");
  assert.ok(design.elements.some((element) => element.type === "text" && /CAFÉ CENTRO|Café Centro/.test(element.text)));
  await page.getByText("Tu diseño está listo").waitFor();
  await page.waitForTimeout(600);
  await assertNoSideScroll(page, "editor");
  await shot(page, "phone-6-editor");

  // Editor: the main actions are on screen and work.
  const download = page.getByTestId("descargar-movil");
  await assertOnScreen(page, download, "phone Descargar");
  await assertOnScreen(page, page.getByRole("button", { name: "Vista previa" }), "phone Vista previa");
  for (const name of ["Editar", "Plantilla", "Formato", "Agregar"]) {
    assert.ok(await page.getByRole("tab", { name }).isVisible(), `tab ${name}`);
  }
  await page.getByRole("button", { name: "Vista previa" }).tap();
  const preview = page.getByRole("dialog", { name: "Vista previa" });
  await preview.getByRole("img").waitFor();
  assert.ok(await preview.getByRole("img").evaluate((image) => image.naturalWidth > 300));
  await shot(page, "phone-7-vista-previa");
  await preview.getByRole("button", { name: "Seguir editando" }).tap();
  await preview.waitFor({ state: "hidden" });

  await page.getByRole("tab", { name: "Plantilla" }).tap();
  const templates = page.getByRole("region", { name: "Plantilla" }).getByRole("button", { pressed: false });
  assert.equal(await templates.count(), 6, "five other templates and the palette button");
  await shot(page, "phone-8-plantillas");
  const other = design.templateId === "nocturno" ? "Clásico" : "Nocturno";
  await page.getByRole("region", { name: "Plantilla" }).getByRole("button", { name: other }).tap();
  await page.waitForFunction(
    ([key, before]) => JSON.parse(window.sessionStorage.getItem(key)).templateId !== before,
    [STUDIO_KEY, design.templateId],
  );
  const switched = await stored(page, STUDIO_KEY);
  assert.equal(switched.elements.filter((element) => element.type === "qr").length, 1);
  assert.equal(switched.elements.find((element) => element.type === "qr").value, "https://www.instagram.com/cafe.centro/");

  await page.getByRole("tab", { name: "Formato" }).tap();
  await page.getByRole("region", { name: "Formato" }).getByRole("button", { name: /Cartel A6/ }).tap();
  await page.waitForFunction((key) => JSON.parse(window.sessionStorage.getItem(key)).format.id === "a6", STUDIO_KEY);
  await shot(page, "phone-9-formato-a6");

  await page.getByRole("tab", { name: "Editar" }).tap();
  await page.getByRole("button", { name: /^Código/ }).tap();
  await page.getByText("El código abre").waitFor();
  assert.ok(await page.getByText("Instagram · @cafe.centro").isVisible());

  await download.tap();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await shot(page, "phone-10-descargar");
  await dialog.getByRole("button", { name: "Cerrar" }).tap();
  await dialog.waitFor({ state: "hidden" });

  // A reload keeps the design.
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Tu diseño" }).waitFor();
  assert.equal((await stored(page, STUDIO_KEY)).format.id, "a6");
  await context.close();
}

/* ------------------------------------------------------------------ */
/* Desktop                                                             */
/* ------------------------------------------------------------------ */
{
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, acceptDownloads: true });
  const page = await context.newPage();
  watch(page, "desktop");

  await page.goto(`${base}/empezar`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "¿Qué querés compartir?" }).waitFor();
  await shot(page, "desktop-1-contenido");
  await page.getByRole("button", { name: /Wi-Fi/ }).click();
  await page.getByLabel("Nombre de la red").fill("Cafe Centro");
  await page.getByLabel("Contraseña").fill("clave-super-secreta");
  await page.getByText("Tu código ya funciona").waitFor();
  await shot(page, "desktop-2-datos");
  // The password is typed on screen but never written to the browser's storage by the flow.
  const rawGuided = await page.evaluate((key) => window.sessionStorage.getItem(key), GUIDED_KEY);
  assert.ok(rawGuided.includes("Cafe Centro"));
  assert.equal(rawGuided.includes("clave-super-secreta"), false);
  await page.getByTestId("accion-principal").click();
  await page.getByRole("heading", { name: "Elegí un estilo" }).waitFor();
  await page.locator('button[aria-pressed] img[src^="data:image/png"]').first().waitFor({ timeout: 30000 });
  await shot(page, "desktop-3-estilo");
  await page.getByRole("button", { name: /Profesional/ }).click();
  await shot(page, "desktop-4-formato");
  await page.getByRole("button", { name: /Mostradores y mesas/ }).click();

  await page.getByRole("heading", { name: "Elegí tu diseño" }).waitFor();
  const radios = await waitForDesigns(page);
  assert.equal(await radios.nth(0).getAttribute("aria-checked"), "true");
  const use = page.getByTestId("usar-diseno-escritorio");
  assert.equal((await use.innerText()).trim(), "Usar este diseño");
  const box = await assertOnScreen(page, use, "desktop Usar este diseño");
  assert.ok(box.width >= 280 && box.height >= 52, "the main action is large");
  assert.equal(await page.getByTestId("accion-principal").isVisible(), false, "one main action, not two");
  await page.getByTestId("diseno-elegido").waitFor();
  await shot(page, "desktop-5-disenos");

  // Changing the style from here gives new proposals and keeps a selection.
  await page.getByRole("button", { name: /Estilo:/ }).click();
  await page.getByRole("button", { name: /Nocturno/ }).click();
  await page.getByRole("button", { name: /Mostradores y mesas/ }).click();
  await waitForDesigns(page);
  assert.equal(await page.getByRole("radio", { checked: true }).count(), 1);
  await page.getByRole("radio").nth(1).click();
  await shot(page, "desktop-5-nocturno");
  await page.getByTestId("usar-diseno-escritorio").click();
  await page.waitForURL(/\/crear\?origen=guiado/);
  await page.getByRole("heading", { name: "Tu diseño" }).waitFor();
  await page.locator("canvas").first().waitFor();
  const first = await stored(page, STUDIO_KEY);
  assert.equal(first.format.id, "a6");
  assert.equal(first.elements.find((element) => element.type === "qr").value, "WIFI:T:WPA;S:Cafe Centro;P:clave-super-secreta;;");
  await page.waitForTimeout(600);
  await shot(page, "desktop-6-editor");

  // Desktop editor: every main action is visible at once.
  await assertOnScreen(page, page.getByTestId("descargar"), "desktop Descargar");
  await assertOnScreen(page, page.getByRole("button", { name: "Vista previa" }), "desktop Vista previa");
  for (const name of ["Plantilla", "Formato", "Agregar"]) {
    assert.ok(await page.getByRole("region", { name }).isVisible(), `panel ${name}`);
  }
  await page.getByRole("button", { name: "Vista previa" }).click();
  await page.getByRole("dialog", { name: "Vista previa" }).getByRole("img").waitFor();
  await shot(page, "desktop-7-vista-previa");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });

  // A second proposal replaces the design without a confirmation; Undo brings the first one back.
  await page.goto(`${base}/empezar`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Datos de tu Wi-Fi" }).waitFor();
  assert.equal(await page.getByLabel("Contraseña").inputValue(), "", "the password was not kept");
  assert.equal(await page.getByLabel("Nombre de la red").inputValue(), "Cafe Centro");
  await page.getByLabel("Contraseña").fill("otra-clave-2026");
  await page.getByTestId("accion-principal").click();
  await page.getByTestId("accion-principal").click();
  await page.getByRole("button", { name: /Tarjetas personales/ }).click();
  await waitForDesigns(page);
  await shot(page, "desktop-5-tarjeta");
  await page.getByTestId("usar-diseno-escritorio").click();
  await page.waitForURL(/\/crear\?origen=guiado/);
  await page.getByText("Con Deshacer volvés al que tenías antes").waitFor();
  const second = await stored(page, STUDIO_KEY);
  assert.equal(second.format.id, "tarjeta");
  await page.getByRole("button", { name: "Deshacer" }).click();
  await page.waitForFunction((key) => JSON.parse(window.sessionStorage.getItem(key)).format.id === "a6", STUDIO_KEY);
  assert.deepEqual((await stored(page, STUDIO_KEY)).elements, first.elements);
  await page.getByRole("button", { name: "Rehacer" }).click();
  await page.waitForFunction((key) => JSON.parse(window.sessionStorage.getItem(key)).format.id === "tarjeta", STUDIO_KEY);

  // An example from the gallery cannot be ordered until its sample code is replaced.
  await page.goto(`${base}/crear?inspiracion=evento`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Tu diseño" }).waitFor();
  assert.equal((await stored(page, STUDIO_KEY)).format.id, "historia");
  await page.getByTestId("descargar").click();
  await page.getByRole("dialog").getByText(/contenido de ejemplo/).first().waitFor();
  await shot(page, "desktop-8-ejemplo");
  await page.keyboard.press("Escape");

  if (process.env.E2E_ORDER === "1") {
    // Local only: the free first order, from the download dialog to the three files.
    await page.goto(`${base}/crear`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^Código/ }).click();
    await page.getByRole("button", { name: "Cambiar contenido" }).click();
    await page.getByLabel("¿Qué abre el código?").selectOption("wifi");
    await page.getByLabel("Nombre de la red").fill("Cafe Centro");
    await page.getByLabel("Contraseña").fill("clave;con:signos");
    await page.getByRole("button", { name: "Aplicar", exact: true }).click();
    await page.getByText("Wi-Fi · Cafe Centro").waitFor();
    await page.getByTestId("descargar").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Tu correo").fill(`prueba-${Date.now()}@example.com`);
    await dialog.getByRole("checkbox").check();
    await shot(page, "desktop-9-descargar");
    await dialog.getByRole("button", { name: "Descargar gratis" }).click();
    await page.waitForURL(/\/pedido\//, { timeout: 30000 });
    await page.getByText("Descargar mis archivos").waitFor({ timeout: 20000 });
    await shot(page, "desktop-10-pedido");
    const { PNG } = await import("pngjs");
    const { default: jsQR } = await import("jsqr");
    for (const label of ["PNG", "PDF", "SVG"]) {
      const [file] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("link", { name: new RegExp(`Descargar ${label}`) }).click(),
      ]);
      const body = readFileSync(await file.path());
      assert.ok(body.length > 1000, `${label} file`);
      if (label === "PNG") {
        const image = PNG.sync.read(body);
        assert.equal(
          jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data,
          "WIFI:T:WPA;S:Cafe Centro;P:clave\\;con\\:signos;;",
        );
        // Story format: 1080 × 1920 px.
        assert.deepEqual([image.width, image.height], [1080, 1920]);
      }
      if (label === "PDF") assert.equal(body.subarray(0, 5).toString("latin1"), "%PDF-");
      if (label === "SVG") assert.ok(body.toString("utf8").includes("<svg"));
    }
  }
  await context.close();
}

await browser.close();
assert.deepEqual(problems, [], "no errors in the browser console");
console.log("guided e2e checks passed (phone and desktop)");
