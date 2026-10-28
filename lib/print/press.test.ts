import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { PRESS_ARTWORK_VERSION } from "../artwork.ts";
import { contrastRatio } from "../color.ts";
import { parseArtworkPreview, parseOrderDraft, readArtworkSnapshot } from "../order-draft.ts";
import { fontFile, printFonts, type PrintFontRole } from "./fonts.ts";
import { compositionChecked, layoutArtwork, pieceComposes, type DrawCommand } from "./layout.ts";
import { renderArtworkSvg } from "./preview.ts";
import { printPixels, renderArtworkFile } from "./render.ts";

const placeUrl = "https://www.google.com/maps/place/Obelisco/@-34.6037,-58.3816,17z";
const reviewUrl = "https://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnopqrst";
const longName = "Taller Electromecánico de la Esquina Norte";
const specialName = "Ñandú Café & José";

const palettes = {
  "review-clean": { fontId: "sora", ink: "#202124", accent: "#1a73e8", surface: "#ffffff", foreground: "#202124", background: "#ffffff" },
  "review-dark": { fontId: "sora", ink: "#f5f6f7", accent: "#d2d6dc", surface: "#101114", foreground: "#101114", background: "#ffffff" },
  "review-brand": { fontId: "source", ink: "#1a1a1a", accent: "#0f6e62", surface: "#f7f5f2", foreground: "#1a1a1a", background: "#ffffff" },
} as const;

function inkLogo(width: number, height: number, rgb: [number, number, number], transparent: boolean): string {
  const png = new PNG({ width, height, colorType: 6 });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const mark = x > width * 0.18 && x < width * 0.82 && y > height * 0.28 && y < height * 0.72;
      png.data[index] = rgb[0];
      png.data[index + 1] = rgb[1];
      png.data[index + 2] = rgb[2];
      png.data[index + 3] = mark || !transparent ? 255 : 0;
    }
  }
  return PNG.sync.write(png).toString("base64");
}

function plateBehind(commands: DrawCommand[], image: Extract<DrawCommand, { type: "image" }>) {
  return commands.find(
    (command) =>
      command.type === "rect" &&
      command.fill === "#f6f4ef" &&
      command.x === image.x &&
      command.y === image.y &&
      command.w === image.w &&
      command.h === image.h,
  );
}

function logo(width: number, height: number, transparent = false): string {
  const png = new PNG({ width, height, colorType: 6 });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const mark = x > width * 0.12 && x < width * 0.88 && y > height * 0.22 && y < height * 0.78;
      png.data[index] = 18;
      png.data[index + 1] = 92;
      png.data[index + 2] = 78;
      png.data[index + 3] = mark ? 255 : transparent ? 0 : 255;
    }
  }
  return PNG.sync.write(png).toString("base64");
}

function piece(templateId: keyof typeof palettes, format: "poster" | "sticker", overrides: Record<string, unknown> = {}) {
  const parsed = parseOrderDraft({
    version: 6,
    objective: "review",
    url: reviewUrl,
    businessName: "Taller Electromecánica Morel",
    logo: null,
    format,
    templateId,
    qrSize: 256,
    email: "cliente@example.com",
    reviewChecked: true,
    ...palettes[templateId],
    ...overrides,
  });
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  if (!parsed.ok || parsed.draft.artwork.version !== PRESS_ARTWORK_VERSION) throw new Error("press");
  return parsed.draft.artwork;
}

function textsOf(commands: DrawCommand[]) {
  return commands.filter((command): command is Extract<DrawCommand, { type: "text" }> => command.type === "text");
}

function qrOf(commands: DrawCommand[]) {
  const qr = commands.find((command) => command.type === "qr");
  assert.ok(qr && qr.type === "qr");
  if (!qr || qr.type !== "qr") throw new Error("qr");
  return qr;
}

function boxesOf(commands: DrawCommand[], pageW: number) {
  const boxes = [];
  for (const command of commands) {
    if (command.type === "rect" && command.x === 0 && command.y === 0 && command.w === pageW) continue;
    if (command.type === "rect" || command.type === "stroke" || command.type === "image") {
      boxes.push({ x: command.x, y: command.y, w: command.w, h: command.h });
    }
    if (command.type === "text") boxes.push({ x: command.x, y: command.y, w: command.width, h: command.size });
    if (command.type === "qr") boxes.push({ x: command.x, y: command.y, w: command.size, h: command.size });
  }
  return boxes;
}

function insideMargin(commands: DrawCommand[], width: number, height: number, margin: number) {
  for (const box of boxesOf(commands, width)) {
    assert.ok(box.x >= margin - 0.05, `x ${box.x}`);
    assert.ok(box.y >= margin - 0.05, `y ${box.y}`);
    assert.ok(box.x + box.w <= width - margin + 0.05, `right ${box.x + box.w}`);
    assert.ok(box.y + box.h <= height - margin + 0.05, `bottom ${box.y + box.h}`);
  }
  for (const [left, a] of boxesOf(commands, width).entries()) {
    for (const b of boxesOf(commands, width).slice(left + 1)) {
      const hairline = (box: { w: number; h: number }) => box.w <= 0.5 || box.h <= 0.5;
      if (hairline(a) && hairline(b)) continue;
      const overlap = a.x < b.x + b.w - 0.35 && a.x + a.w > b.x + 0.35 && a.y < b.y + b.h - 0.35 && a.y + a.h > b.y + 0.35;
      assert.equal(overlap, false);
    }
  }
}

function framePieces(commands: DrawCommand[]) {
  return commands.filter((command) => command.type === "rect" && command.w <= 8 && command.h <= 8);
}

function visible(commands: DrawCommand[]) {
  return textsOf(commands).map((command) => command.text).join(" ");
}

function nameText(commands: DrawCommand[], name: string) {
  return textsOf(commands)
    .filter((command) => name.includes(command.text))
    .map((command) => command.text)
    .join(" ");
}

const cleanPoster = piece("review-clean", "poster");
const darkPoster = piece("review-dark", "poster");
const brandPoster = piece("review-brand", "poster");
const cleanScene = layoutArtwork(cleanPoster);
const darkScene = layoutArtwork(darkPoster);
const brandScene = layoutArtwork(brandPoster);

assert.equal(cleanScene.widthMm, 105);
assert.equal(cleanScene.heightMm, 148);
assert.equal(darkScene.widthMm, 105);
assert.equal(brandScene.heightMm, 148);
assert.equal(qrOf(cleanScene.commands).size, 72);
assert.equal(qrOf(darkScene.commands).size, 78);
assert.ok(qrOf(brandScene.commands).size >= 64 && qrOf(brandScene.commands).size <= 72);
assert.ok(qrOf(darkScene.commands).size > qrOf(cleanScene.commands).size);

const cleanMessage = textsOf(cleanScene.commands).find((command) => command.text.startsWith("Dejanos"));
const darkMessage = textsOf(darkScene.commands).find((command) => command.text.startsWith("Dejanos"));
const brandMessage = textsOf(brandScene.commands).find((command) => command.text.startsWith("Dejanos"));
const brandName = textsOf(brandScene.commands).find((command) => command.text.startsWith("Taller"));
assert.equal(cleanMessage?.align, "center");
assert.equal(darkMessage?.align, "left");
assert.equal(brandMessage?.align, "left");
assert.ok(brandName && brandMessage && brandName.y < brandMessage.y);

const cleanQr = qrOf(cleanScene.commands);
const darkQr = qrOf(darkScene.commands);
const cleanInstruction = textsOf(cleanScene.commands).find((command) => command.text.startsWith("Escaneá"));
const darkInstruction = textsOf(darkScene.commands).find((command) => command.text.startsWith("Escaneá"));
assert.ok(cleanInstruction && cleanInstruction.y >= cleanQr.y + cleanQr.size);
assert.ok(darkInstruction && darkInstruction.y + darkInstruction.size <= darkQr.y);
assert.equal(darkQr.background, "#ffffff");
assert.equal(framePieces(cleanScene.commands).length, 0);
assert.equal(framePieces(darkScene.commands).length, 0);
const darkRule = darkScene.commands.find(
  (command) => command.type === "rect" && command.w < darkScene.widthMm && command.h <= 0.5,
);
assert.ok(darkRule && darkRule.type === "rect");
if (darkRule && darkRule.type === "rect") {
  assert.equal(darkRule.fill, "#d2d6dc");
  assert.ok(darkRule.w <= 16);
}
const cleanNameLine = textsOf(cleanScene.commands).find((command) => command.text.startsWith("Taller"));
assert.ok(cleanNameLine);
if (cleanNameLine) {
  const gap = cleanQr.y - (cleanNameLine.y + cleanNameLine.size);
  assert.ok(gap >= 4 && gap <= 16, `clean gap ${gap}`);
}
assert.equal(
  cleanScene.commands.some((command) => command.type === "rect" && command.h < 2 && command.w <= 36 && command.fill === "#1a73e8"),
  true,
);
const quietDark = layoutArtwork(piece("review-dark", "poster", { accent: "#141618" }));
assert.equal(qrOf(quietDark.commands).size, 78);
assert.equal(
  quietDark.commands.some((command) => command.type === "rect" && command.w < quietDark.widthMm),
  false,
);
assert.equal(
  brandScene.commands.some((command) => command.type === "rect" && command.x === 0 && command.w < 20),
  false,
);

for (const scene of [cleanScene, darkScene, brandScene]) {
  insideMargin(scene.commands, scene.widthMm, scene.heightMm, 8);
  assert.equal(visible(scene.commands).includes("…"), false);
  assert.equal(visible(scene.commands).includes("NFC"), false);
  assert.equal(visible(scene.commands).includes("Dejanos tu reseña en Google"), true);
  assert.equal(visible(scene.commands).includes("Encontranos en Google Maps"), false);
  assert.equal(qrOf(scene.commands).href, reviewUrl);
  for (const command of textsOf(scene.commands)) {
    const artwork = scene === darkScene ? darkPoster : scene === brandScene ? brandPoster : cleanPoster;
    assert.ok(contrastRatio(command.color, artwork.surface) >= 3);
  }
  assert.ok(contrastRatio(qrOf(scene.commands).foreground, qrOf(scene.commands).background) >= 3);
}

const cleanSticker = layoutArtwork(piece("review-clean", "sticker"));
const darkSticker = layoutArtwork(piece("review-dark", "sticker"));
const brandSticker = layoutArtwork(piece("review-brand", "sticker"));
for (const scene of [cleanSticker, darkSticker, brandSticker]) {
  assert.equal(scene.widthMm, 80);
  assert.equal(scene.heightMm, 80);
  assert.ok(qrOf(scene.commands).size >= 48);
  insideMargin(scene.commands, 80, 80, 4);
}
assert.equal(qrOf(darkSticker.commands).size, 56);
assert.ok(qrOf(cleanSticker.commands).size >= 52);
assert.equal(textsOf(cleanSticker.commands).find((command) => command.text.startsWith("Dejanos"))?.align, "center");
assert.equal(textsOf(darkSticker.commands).some((command) => command.align === "center"), false);
assert.equal(framePieces(darkSticker.commands).length, 0);
assert.equal(
  cleanSticker.commands.some((command) => command.type === "rect" && command.h < 2),
  true,
);
assert.equal(
  brandSticker.commands.some((command) => command.type === "rect" && command.h < 2),
  true,
);
assert.ok(qrOf(cleanSticker.commands).size / 80 > qrOf(cleanScene.commands).size / 148);

const longPoster = layoutArtwork(piece("review-clean", "poster", { businessName: longName }));
assert.equal(nameText(longPoster.commands, longName), longName);
assert.equal(visible(longPoster.commands).includes("…"), false);
const longSticker = layoutArtwork(piece("review-brand", "sticker", { businessName: longName }));
assert.equal(nameText(longSticker.commands, longName), longName);
assert.ok(qrOf(longSticker.commands).size >= 48);

const special = layoutArtwork(piece("review-dark", "poster", { businessName: specialName }));
assert.equal(nameText(special.commands, specialName), specialName);

const location = piece("review-dark", "sticker", { objective: "location", url: placeUrl, reviewChecked: false });
const locationScene = layoutArtwork(location);
assert.equal(location.href, placeUrl);
assert.equal(location.message, "Encontranos en Google Maps");
assert.equal(visible(locationScene.commands).includes("Encontranos en Google Maps"), true);
assert.equal(visible(locationScene.commands).includes("Dejanos tu reseña en Google"), false);
assert.equal(qrOf(locationScene.commands).href, placeUrl);

assert.equal(layoutArtwork(piece("review-brand", "poster")).commands.some((command) => command.type === "image"), false);

const wide = layoutArtwork(piece("review-brand", "poster", { logo: { data: logo(320, 96) } }));
const wideImage = wide.commands.find((command) => command.type === "image");
assert.ok(wideImage && wideImage.type === "image" && wideImage.w > wideImage.h);
const wideName = textsOf(wide.commands).find((command) => command.text.startsWith("Taller"));
assert.ok(wideImage && wideImage.type === "image" && wideName);
if (wideImage && wideImage.type === "image" && wideName) {
  assert.ok(wideImage.y + wideImage.h <= wideName.y + 0.2);
}

const lockup = layoutArtwork(piece("review-brand", "poster", { logo: { data: logo(220, 120) } }));
const lockupImage = lockup.commands.find((command) => command.type === "image");
const lockupName = textsOf(lockup.commands).find((command) => command.text.startsWith("Taller"));
assert.ok(lockupImage && lockupImage.type === "image" && lockupName);
if (lockupImage && lockupImage.type === "image" && lockupName) {
  assert.ok(lockupImage.y < lockupName.y + lockupName.size && lockupName.y < lockupImage.y + lockupImage.h);
}

const square = layoutArtwork(
  piece("review-brand", "poster", { logo: { data: logo(256, 256) }, businessName: "Panadería Sur" }),
);
const squareImage = square.commands.find((command) => command.type === "image");
const squareName = textsOf(square.commands).find((command) => command.text === "Panadería Sur");
assert.ok(squareImage && squareImage.type === "image" && squareName);
if (squareImage && squareImage.type === "image" && squareName) {
  assert.ok(Math.abs(squareImage.w - squareImage.h) <= 0.6);
  assert.ok(squareImage.y + squareImage.h <= squareName.y + 0.2);
}

const clear = layoutArtwork(
  piece("review-brand", "poster", { logo: { data: logo(320, 96, true) }, businessName: "Panadería Sur" }),
);
const clearImage = clear.commands.find((command) => command.type === "image");
assert.ok(clearImage && clearImage.type === "image");
if (clearImage && clearImage.type === "image") {
  const decoded = PNG.sync.read(Buffer.from(clearImage.data, "base64"));
  assert.equal([...decoded.data].some((value, index) => index % 4 === 3 && value === 0), true);
  assert.equal(
    clear.commands.some(
      (command) => command.type === "rect" && command.x === clearImage.x && command.y === clearImage.y && command.w === clearImage.w,
    ),
    false,
  );
}

const darkInk = inkLogo(240, 96, [26, 26, 26], true);
const darkWithLogo = piece("review-dark", "poster", { logo: { data: darkInk } });
const darkLogoScene = layoutArtwork(darkWithLogo);
const darkLogoImage = darkLogoScene.commands.find((command) => command.type === "image");
assert.ok(darkLogoImage && darkLogoImage.type === "image");
if (darkLogoImage && darkLogoImage.type === "image") {
  assert.equal(darkLogoImage.data, darkInk);
  assert.ok(plateBehind(darkLogoScene.commands, darkLogoImage));
  assert.equal(qrOf(darkLogoScene.commands).size, qrOf(darkScene.commands).size);
  assert.equal(qrOf(darkLogoScene.commands).y, qrOf(darkScene.commands).y);
}
const lightInk = inkLogo(240, 96, [245, 246, 247], true);
const lightScene = layoutArtwork(piece("review-dark", "poster", { logo: { data: lightInk } }));
assert.equal(lightScene.commands.some((command) => command.type === "rect" && command.fill === "#f6f4ef"), false);
const opaqueInk = inkLogo(240, 96, [26, 26, 26], false);
const opaqueScene = layoutArtwork(piece("review-dark", "poster", { logo: { data: opaqueInk } }));
assert.equal(opaqueScene.commands.some((command) => command.type === "rect" && command.fill === "#f6f4ef"), false);
const cleanWithDarkInk = layoutArtwork(piece("review-clean", "poster", { logo: { data: darkInk } }));
assert.equal(cleanWithDarkInk.commands.some((command) => command.type === "rect" && command.fill === "#f6f4ef"), false);
const storedDark = readArtworkSnapshot(darkWithLogo);
assert.ok(storedDark && storedDark.version === 6 && storedDark.logo);
if (storedDark && storedDark.version === 6 && storedDark.logo) {
  assert.equal(storedDark.logo.data, darkInk);
  const replay = layoutArtwork(storedDark);
  const replayImage = replay.commands.find((command) => command.type === "image");
  assert.ok(replayImage && replayImage.type === "image" && plateBehind(replay.commands, replayImage));
}
const darkLogoFile = await renderArtworkFile(darkWithLogo, "png");
const darkLogoPng = PNG.sync.read(darkLogoFile.body);
if (darkLogoImage && darkLogoImage.type === "image") {
  const sampleX = Math.round(((darkLogoImage.x + darkLogoImage.w * 0.08) * 300) / 25.4);
  const sampleY = Math.round(((darkLogoImage.y + darkLogoImage.h * 0.1) * 300) / 25.4);
  const sample = (sampleY * darkLogoPng.width + sampleX) * 4;
  assert.ok(Math.abs((darkLogoPng.data[sample] ?? 0) - 246) < 8);
  assert.ok(Math.abs((darkLogoPng.data[sample + 1] ?? 0) - 244) < 8);
  assert.ok(Math.abs((darkLogoPng.data[sample + 2] ?? 0) - 239) < 8);
}
assert.equal(decodePng(darkLogoFile.body), reviewUrl);
const darkStickerLogo = layoutArtwork(piece("review-dark", "sticker", { logo: { data: darkInk } }));
const darkStickerImage = darkStickerLogo.commands.find((command) => command.type === "image");
assert.ok(darkStickerImage && darkStickerImage.type === "image" && plateBehind(darkStickerLogo.commands, darkStickerImage));
assert.ok(qrOf(darkStickerLogo.commands).size >= 48);

const stickerLogo = layoutArtwork(piece("review-brand", "sticker", { logo: { data: logo(256, 256) }, businessName: "Panadería Sur" }));
assert.ok(qrOf(stickerLogo.commands).size >= 48);
assert.equal(stickerLogo.commands.some((command) => command.type === "image"), true);

const overflow = parseOrderDraft({
  version: 6,
  objective: "review",
  url: reviewUrl,
  businessName: "W".repeat(42),
  logo: null,
  format: "sticker",
  templateId: "review-clean",
  fontId: "sora",
  ink: "#202124",
  accent: "#1a73e8",
  surface: "#ffffff",
  foreground: "#202124",
  background: "#ffffff",
  qrSize: 256,
  email: "cliente@example.com",
  reviewChecked: true,
});
assert.equal(overflow.ok, false);
if (!overflow.ok) assert.equal(overflow.error, "title-overflow");

assert.equal(compositionChecked(cleanPoster), true);
assert.equal(pieceComposes(cleanPoster), true);
const legacy = parseOrderDraft({
  goal: "ubicacion",
  url: placeUrl,
  templateId: "cartel-ubicacion",
  businessName: "Taller Electromecánica Morel",
  headline: "Escaneá para ver cómo llegar",
  foreground: "#14221f",
  background: "#ffffff",
  qrSize: 256,
  email: "cliente@example.com",
});
assert.equal(legacy.ok, true);
if (legacy.ok) {
  assert.equal(legacy.draft.artwork.version, 1);
  assert.equal(compositionChecked(legacy.draft.artwork), false);
}

const previewBody = {
  version: 6,
  objective: "review",
  url: reviewUrl,
  businessName: "Taller Electromecánica Morel",
  logo: null,
  format: "poster",
  templateId: "review-clean",
  fontId: "sora",
  ink: "#202124",
  accent: "#1a73e8",
  surface: "#ffffff",
  foreground: "#202124",
  background: "#ffffff",
  qrSize: 256,
};
const preview = parseArtworkPreview(previewBody);
assert.equal(preview.ok, true);
if (preview.ok) {
  const svg = renderArtworkSvg(preview.artwork);
  const exported = await renderArtworkFile(preview.artwork, "svg");
  assert.equal(svg, exported.body.toString("utf8"));
  assert.equal(svg, renderArtworkSvg(cleanPoster));
}

const png = await renderArtworkFile(cleanPoster, "png");
const pdf = await renderArtworkFile(cleanPoster, "pdf");
assert.equal(png.body.readUInt32BE(16), printPixels(105));
assert.equal(png.body.readUInt32BE(20), printPixels(148));
assert.equal(decodePng(png.body), reviewUrl);
assert.equal(decodeSvg(renderArtworkSvg(cleanPoster), printPixels(105)), reviewUrl);
assert.equal(pdf.body.subarray(0, 4).toString("utf8"), "%PDF");
assert.ok(pdf.body.length > 1000);
const stickerPng = await renderArtworkFile(piece("review-dark", "sticker"), "png");
assert.equal(stickerPng.body.readUInt32BE(16), printPixels(80));
assert.equal(stickerPng.body.readUInt32BE(20), printPixels(80));
assert.equal(decodePng(stickerPng.body), reviewUrl);

const fingerprints = {
  v1: "a6d16278de66bb235eb4858fb902a0cf227f76e4b4ba57ed4a737a1acd26ed73",
  v2: "ca82fdac2087526e93cd628793a7b53e4e4669f3a0a1893e53c2ffe0cab19288",
  v3: "6356f4216bf8c9994485e487c80cb65cdb738ebc52ba21ce396f8aaf4b9c1634",
  v4: "623308df8de1ad0833729c89b017ff2a1b305d3144a4a863d4cf30215a5257a0",
  v5: "bd188b03f278c11e1ae1faec39a898d431805cecdd748cdcd82656ce294a4d32",
};

const historical = [
  ["v1", fingerprints.v1, {
    goal: "ubicacion",
    url: placeUrl,
    templateId: "cartel-ubicacion",
    businessName: "Taller Electromecánica Morel",
    headline: "Escaneá para ver cómo llegar",
    foreground: "#14221f",
    background: "#ffffff",
    qrSize: 256,
    email: "cliente@example.com",
  }],
  ["v2", fingerprints.v2, {
    goal: "ubicacion",
    url: placeUrl,
    templateId: "minimal-elegance",
    businessName: "Taller Electromecánica Morel",
    subtitle: "Encontranos en Google Maps",
    fontId: "fraunces",
    ink: "#1c1915",
    accent: "#8a7048",
    surface: "#f3efe6",
    foreground: "#1c1915",
    background: "#fffcf8",
    qrSize: 256,
    logo: null,
    email: "cliente@example.com",
  }],
  ["v3", fingerprints.v3, {
    version: 3,
    goal: "ubicacion",
    url: placeUrl,
    templateId: "dark-premium",
    businessName: "Taller Electromecánica Morel",
    subtitle: "Encontranos en Google Maps",
    fontId: "fraunces",
    ink: "#f4efe4",
    accent: "#d4b483",
    surface: "#12100e",
    foreground: "#1a1612",
    background: "#f7f1e6",
    qrSize: 256,
    logo: null,
    email: "cliente@example.com",
  }],
  ["v4", fingerprints.v4, {
    version: 4,
    goal: "ubicacion",
    url: placeUrl,
    templateId: "google-clean",
    businessName: "Taller Electromecánica Morel",
    subtitle: "Encontranos en Google Maps",
    fontId: "sora",
    ink: "#202124",
    accent: "#1a73e8",
    surface: "#ffffff",
    foreground: "#202124",
    background: "#ffffff",
    qrSize: 256,
    logo: null,
    email: "cliente@example.com",
  }],
  ["v5", fingerprints.v5, {
    version: 5,
    objective: "location",
    url: placeUrl,
    businessName: "Taller Electromecánica Morel",
    logo: null,
    format: "poster",
    templateId: "review-clean",
    fontId: "sora",
    ink: "#202124",
    accent: "#1a73e8",
    surface: "#ffffff",
    foreground: "#202124",
    background: "#ffffff",
    qrSize: 256,
    email: "cliente@example.com",
    reviewChecked: false,
  }],
] as const;

for (const [label, expected, body] of historical) {
  const parsed = parseOrderDraft(body);
  assert.equal(parsed.ok, true, `${label} ${parsed.ok ? "" : parsed.error}`);
  if (!parsed.ok) continue;
  const digest = createHash("sha256").update(JSON.stringify(layoutArtwork(parsed.draft.artwork))).digest("hex");
  assert.equal(digest, expected, label);
}

const pressDigest = createHash("sha256").update(JSON.stringify(cleanScene)).digest("hex");
assert.notEqual(pressDigest, fingerprints.v5);

// Published version 6. A redesign must ship as a new artwork version and leave this hash unchanged.
const publishedPress = (["review-clean", "review-dark", "review-brand"] as const).flatMap((templateId) =>
  (["poster", "sticker"] as const).map((format) => layoutArtwork(piece(templateId, format))),
);
const publishedDigest = createHash("sha256").update(JSON.stringify(publishedPress)).digest("hex");
assert.equal(publishedDigest, "0ecf4dd3eb5ac36e91078d08f69472e0b187e17a6d124bb951007833d9a630f7");

function decodePng(body: Buffer): string | null {
  const image = PNG.sync.read(body);
  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data ?? null;
}

function decodeSvg(svg: string, widthPx: number): string | null {
  const roles = Object.keys(printFonts) as PrintFontRole[];
  const rendered = new Resvg(svg, {
    font: {
      fontFiles: roles.map((role) => fontFile(role)),
      loadSystemFonts: false,
      defaultFontFamily: printFonts.body.family,
    },
    shapeRendering: 1,
    textRendering: 1,
    fitTo: { mode: "width", value: widthPx },
  }).render();
  return decodePng(rendered.asPng());
}

console.log("press checks passed");
