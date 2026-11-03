import { writeFileSync, mkdirSync } from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./alias-loader.mjs", pathToFileURL("./scripts/register-test.mjs"));

const { PNG } = await import("pngjs");
const { addImage, addRect, updateElement } = await import("../lib/studio/document.ts");
const { exportStudioDesign } = await import("../lib/studio/export/index.ts");
const { createDocument } = await import("../lib/studio/templates.ts");

const PLACE_URL = "https://www.google.com/maps/place/Obelisco/@-34.6037,-58.3816,17z";
const REVIEW_URL = "https://example.com/verde-vivo";

function logo(width, height, alpha = 255) {
  const png = new PNG({ width, height, colorType: 6 });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = 20;
    png.data[index + 1] = 90;
    png.data[index + 2] = 80;
    png.data[index + 3] = alpha;
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString("base64")}`;
}

function withQrUrl(document, url) {
  const qr = document.elements.find((element) => element.type === "qr");
  return updateElement(document, qr.id, { value: url });
}

function corporateSample() {
  let document = withQrUrl(createDocument("corporativo"), PLACE_URL);
  document = updateElement(document, document.elements.find((el) => el.role === "titulo").id, {
    text: "Norte Técnica",
  });
  document = updateElement(document, document.elements.find((el) => el.role === "rubro").id, {
    text: "Servicio técnico",
  });
  const mark = addImage(document, "logo-norte", logo(240, 240), "norte-mark", 240, 240);
  document = updateElement(mark, "logo-norte", { x: 10, y: 88, width: 18, height: 18, rotation: 0 });
  return document;
}

function creativeSample() {
  let document = withQrUrl(createDocument("creativo"), REVIEW_URL);
  document = updateElement(document, document.elements.find((el) => el.role === "titulo").id, {
    text: "Verde Vivo Studio",
  });
  const brand = addImage(document, "logo-verde", logo(320, 320), "verde-vivo", 320, 320);
  document = updateElement(brand, "logo-verde", { x: 14, y: 70, width: 28, height: 28, rotation: 0 });
  const accent = addRect(document, "deco-1");
  document = updateElement(accent, "deco-1", {
    x: 78,
    y: 72,
    width: 16,
    height: 16,
    rotation: 18,
    fill: "#94d2bd",
    cornerRadius: 4,
  });
  return document;
}

mkdirSync(".data", { recursive: true });
for (const sample of [
  { name: "corporativo", document: corporateSample() },
  { name: "creativo", document: creativeSample() },
]) {
  for (const format of ["png", "svg", "pdf"]) {
    const result = await exportStudioDesign(sample.document, format);
    if (!result.ok) throw new Error(`${sample.name} ${format}: ${result.error}`);
    writeFileSync(`.data/studio-export-${sample.name}.${format}`, result.body);
    console.log(`wrote .data/studio-export-${sample.name}.${format} (${result.body.length} bytes)`);
  }
}
