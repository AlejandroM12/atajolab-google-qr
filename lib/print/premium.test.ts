import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import {
  PREMIUM_ARTWORK_VERSION,
  PRESS_ARTWORK_VERSION,
  premiumDefaultMessage,
  premiumTemplates,
  type PremiumTemplateId,
} from "../artwork.ts";
import { contrastRatio, shopStripeReadable } from "../color.ts";
import { parseArtworkPreview, parseOrderDraft, readArtworkSnapshot } from "../order-draft.ts";
import { PIECE_PRICE_ARS } from "../pricing.ts";
import { fontFile, printFonts, type PrintFontRole } from "./fonts.ts";
import { compositionChecked, layoutArtwork, type DrawCommand } from "./layout.ts";
import { STICKER_INSTRUCTION_MM } from "./premium.ts";
import { renderArtworkSvg } from "./preview.ts";
import { QR_QUIET_ZONE } from "./qr-matrix.ts";
import { printPixels, renderArtworkFile } from "./render.ts";

const reviewUrl = "https://search.google.com/local/writereview?placeid=ChIJabcdefghijklmnopqrst";
const placeUrl = "https://www.google.com/maps/place/Obelisco/@-34.6037,-58.3816,17z";
const logoColors = ["#4285f4", "#34a853", "#ea4335"];
const underlineColors = ["#1a73e8", "#fbbc04", "#188038"];
const templates = premiumTemplates.map((template) => template.id);

assert.equal(PIECE_PRICE_ARS, 4900);
assert.equal(PREMIUM_ARTWORK_VERSION, 7);
assert.equal(QR_QUIET_ZONE, 4);
assert.equal(STICKER_INSTRUCTION_MM, 5.2);

function logo(width: number, height: number): string {
  const png = new PNG({ width, height, colorType: 6 });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      png.data[index] = 28;
      png.data[index + 1] = 25;
      png.data[index + 2] = 21;
      png.data[index + 3] = 255;
    }
  }
  return PNG.sync.write(png).toString("base64");
}

function body(overrides: Record<string, unknown> = {}) {
  const templateId = typeof overrides.templateId === "string" ? overrides.templateId : "stand-classic";
  return {
    version: PREMIUM_ARTWORK_VERSION,
    objective: "review",
    url: reviewUrl,
    businessName: "",
    message: premiumDefaultMessage(templateId as PremiumTemplateId),
    logo: null,
    format: "poster",
    templateId,
    accent: "#1c1915",
    email: "cliente@example.com",
    reviewChecked: true,
    ...overrides,
  };
}

function piece(templateId: PremiumTemplateId, format: "poster" | "sticker", overrides: Record<string, unknown> = {}) {
  const parsed = parseOrderDraft(body({ templateId, format, ...overrides }));
  assert.equal(parsed.ok, true, parsed.ok ? "" : `${templateId} ${format} ${parsed.error}`);
  if (!parsed.ok || parsed.draft.artwork.version !== PREMIUM_ARTWORK_VERSION) throw new Error("premium");
  return parsed.draft.artwork;
}

function texts(commands: DrawCommand[]) {
  return commands.filter((command): command is Extract<DrawCommand, { type: "text" }> => command.type === "text");
}

function stars(commands: DrawCommand[]) {
  return commands.filter((command): command is Extract<DrawCommand, { type: "star" }> => command.type === "star");
}

function googleClearOfStars(commands: DrawCommand[]) {
  for (const text of texts(commands).filter((command) => /Google/.test(command.text))) {
    for (const star of stars(commands)) {
      const nearY = star.cy + star.r > text.y - 1 && star.cy - star.r < text.y + text.size + 1;
      const nearX = star.cx + star.r > text.x - 1 && star.cx - star.r < text.x + text.width + 1;
      assert.equal(nearY && nearX, false, text.text);
    }
  }
}

const wideLogo = logo(64, 32);
const locked = {
  "stand-classic": "#a16207",
  "stand-vivid": "#ff4d00",
  "stand-dark": "#ffb000",
} as const;

for (const templateId of templates) {
  for (const format of ["poster", "sticker"] as const) {
    const empty = piece(templateId, format);
    const named = piece(templateId, format, { businessName: "Barbería Norte" });
    const marked = piece(templateId, format, { businessName: "Barbería Norte", logo: { data: wideLogo } });
    const located = piece(templateId, format, { objective: "location", url: placeUrl, reviewChecked: false });
    for (const artwork of [empty, named, marked, located]) {
      assert.equal(compositionChecked(artwork), true);
      assert.equal(artwork.href, artwork.objective === "review" ? reviewUrl : placeUrl);
      const scene = layoutArtwork(artwork);
      assert.equal(scene.widthMm, format === "poster" ? 105 : 80);
      assert.equal(scene.heightMm, format === "poster" ? 148 : 80);
      const serialized = JSON.stringify(scene);
      assert.equal(serialized.includes("MUESTRA"), false);
      for (const color of logoColors) assert.equal(serialized.toLowerCase().includes(color), false, color);
      const googleLines = texts(scene.commands).filter((line) => line.text.includes("Google"));
      const bars = scene.commands.filter(
        (command) => command.type === "rect" && underlineColors.includes(command.fill),
      );
      assert.equal(bars.length, googleLines.length * 3, `${templateId} ${format}`);
      const qr = scene.commands.find((command) => command.type === "qr");
      assert.ok(qr && qr.type === "qr");
      if (qr && qr.type === "qr") {
        assert.equal(qr.href, artwork.href);
        assert.equal(qr.background, "#ffffff");
        if (format === "sticker") assert.ok(qr.size >= 28 && qr.size <= 32);
      }
      googleClearOfStars(scene.commands);
      const lines = texts(scene.commands);
      assert.equal(lines.some((line) => line.text.includes("…")), false);
      const expectsStars =
        artwork.objective === "review" &&
        (templateId !== "stand-shop" || (format === "poster" && Boolean(artwork.businessName || artwork.logo)));
      assert.equal(stars(scene.commands).length, expectsStars ? 5 : 0);
      if (templateId === "stand-vivid" && artwork.objective === "review") {
        const bandFill = format === "poster" ? "#ff4d00" : "#0c3b32";
        const band = scene.commands.find((command) => command.type === "rect" && command.fill === bandFill);
        const card = scene.commands.find((command) => command.type === "rect" && command.fill === "#ffffff");
        assert.ok(band && band.type === "rect" && card && card.type === "rect");
        for (const star of stars(scene.commands)) {
          assert.ok(star.cy + star.r < band.y + band.h - 0.5, `${format} estrella fuera de la franja`);
          assert.ok(card.y > star.cy + star.r + 0.4, `${format} estrella bajo la tarjeta`);
          for (const text of texts(scene.commands)) {
            const hitY = star.cy + star.r > text.y && star.cy - star.r < text.y + text.size;
            const hitX = star.cx + star.r > text.x && star.cx - star.r < text.x + text.width;
            assert.equal(hitY && hitX, false, `${format} ${text.text}`);
          }
        }
      }
      if (format === "sticker") {
        const instruction = lines.filter((line) => /Google|llegar/.test(line.text));
        assert.ok(instruction.length > 0);
        for (const line of instruction) assert.ok(line.size >= STICKER_INSTRUCTION_MM);
      } else {
        const instruction = lines.filter((line) => /Google|llegar/.test(line.text));
        assert.ok(instruction.every((line) => line.size >= 5.6));
      }
      const stored = readArtworkSnapshot(artwork);
      assert.deepEqual(stored, artwork);
    }
    assert.equal(empty.businessName, "");
    assert.equal(empty.logo, null);
    assert.equal(layoutArtwork(empty).commands.some((command) => command.type === "image"), false);
    const image = layoutArtwork(marked).commands.find((command) => command.type === "image");
    assert.ok(image && image.type === "image");
    if (image && image.type === "image") {
      assert.ok(Math.abs(image.w / image.h - 2) < 0.05);
    }
    if (templateId === "stand-shop") assert.equal(empty.accent, "#1c1915");
    else assert.equal(empty.accent, locked[templateId]);
  }
}

const classicPoster = layoutArtwork(piece("stand-classic", "poster"));
const classicSticker = layoutArtwork(piece("stand-classic", "sticker"));
assert.deepEqual(
  texts(classicPoster.commands).map((line) => line.text),
  ["Tu opinión nos importa", "Escaneá y dejanos tu reseña", "en Google"],
);
assert.deepEqual(
  texts(classicSticker.commands).map((line) => line.text),
  ["Tu opinión nos importa", "Escaneá y dejanos", "tu reseña en Google"],
);
const classicStickerQr = classicSticker.commands.find((command) => command.type === "qr");
const vividStickerQr = layoutArtwork(piece("stand-vivid", "sticker")).commands.find((command) => command.type === "qr");
assert.ok(classicStickerQr && classicStickerQr.type === "qr" && classicStickerQr.size === 32);
assert.ok(vividStickerQr && vividStickerQr.type === "qr" && vividStickerQr.size === 32);
const shopPosterQr = layoutArtwork(piece("stand-shop", "poster", { businessName: "Barbería Norte" })).commands.find(
  (command) => command.type === "qr",
);
assert.ok(shopPosterQr && shopPosterQr.type === "qr" && shopPosterQr.size >= 60);
const vividOrange = "#ff4d00";
const vividInk = "#1c1915";
const largeTextMm = 6.4;
const tightMessage = "ancho ancho ancho ancho ancho ancho anchoooooooo";
assert.equal(tightMessage.length, 48);
assert.ok(contrastRatio("#ffffff", vividOrange) >= 3);
assert.ok(contrastRatio("#ffffff", vividOrange) < 4.5);
assert.ok(contrastRatio(vividInk, vividOrange) >= 4.5);
assert.ok(contrastRatio("#0c3b32", vividOrange) < 4.5);

function onOrange(scene: ReturnType<typeof layoutArtwork>, line: { x: number; y: number; size: number }) {
  const band = scene.commands.find((command) => command.type === "rect" && command.fill === vividOrange);
  assert.ok(band && band.type === "rect");
  return line.x >= band.x && line.y + line.size <= band.y + band.h;
}

for (const artwork of [
  piece("stand-vivid", "poster", { businessName: "Barbería Norte" }),
  piece("stand-vivid", "poster", { businessName: "Barbería Norte", logo: { data: wideLogo } }),
  piece("stand-vivid", "poster", { objective: "location", url: placeUrl, reviewChecked: false, businessName: "Barbería Norte" }),
  piece("stand-vivid", "poster", { message: "Contanos cómo te atendimos hoy en el local" }),
  piece("stand-vivid", "poster", { message: tightMessage }),
]) {
  const scene = layoutArtwork(artwork);
  const lines = texts(scene.commands);
  const name = lines.find((line) => line.text === "Barbería Norte");
  if (artwork.businessName) {
    assert.ok(name);
    assert.equal(name.color, vividInk);
    assert.ok(onOrange(scene, name));
    assert.ok(contrastRatio(name.color, vividOrange) >= 4.5);
  }
  const shout = lines.filter((line) => line.color === "#ffffff");
  assert.ok(shout.length > 0);
  for (const line of shout) {
    assert.ok(onOrange(scene, line), line.text);
    assert.ok(line.size >= largeTextMm, `${line.text} ${line.size}`);
    assert.ok((line.size * 72) / 25.4 >= 18, line.text);
  }
}
const tightScene = layoutArtwork(piece("stand-vivid", "poster", { message: tightMessage }));
assert.ok(texts(tightScene.commands).some((line) => line.color === "#ffffff" && line.size === largeTextMm));
const overflow = parseOrderDraft(body({ templateId: "stand-vivid", message: "Mmmmmmm mmmmmmm mmmmmmm mmmmmmm mmmmmmm mmm" }));
assert.equal(overflow.ok, false);
if (!overflow.ok) assert.equal(overflow.error, "composition");
const vividStickerName = texts(layoutArtwork(piece("stand-vivid", "sticker", { businessName: "Barbería Norte" })).commands).find(
  (line) => line.text === "Barbería Norte",
);
assert.equal(vividStickerName?.color, "#ffffff");
const darkName = texts(layoutArtwork(piece("stand-dark", "poster", { businessName: "Barbería Norte" })).commands).find(
  (line) => line.text === "Barbería Norte",
);
assert.equal(darkName?.color, "#f7f4ee");
const shopName = texts(layoutArtwork(piece("stand-shop", "poster", { businessName: "Barbería Norte" })).commands).find(
  (line) => line.text === "Barbería Norte",
);
assert.equal(shopName?.color, vividInk);

const longMessage = parseOrderDraft(body({ templateId: "stand-classic", format: "sticker", message: "W".repeat(40) }));
assert.equal(longMessage.ok, false);
if (!longMessage.ok) assert.equal(longMessage.error, "composition");
assert.equal(classicPoster.commands.filter((command) => command.type === "stroke").length, 2);
assert.notEqual(classicPoster.widthMm, classicSticker.widthMm);

const pale = parseOrderDraft(body({ templateId: "stand-shop", accent: "#f7f1e8" }));
assert.equal(pale.ok, false);
if (!pale.ok) assert.equal(pale.error, "accent-contrast");
assert.equal(shopStripeReadable("#f7f1e8"), false);
assert.equal(shopStripeReadable("#1c1915"), true);

const shop = piece("stand-shop", "poster", { accent: "#0b3a82", businessName: "Barbería Norte" });
assert.equal(shop.accent, "#0b3a82");
const shopScene = layoutArtwork(shop);
assert.ok(shopScene.commands.some((command) => command.type === "rect" && command.fill === "#0b3a82"));

const unchecked = parseOrderDraft(body({ reviewChecked: false }));
assert.equal(unchecked.ok, false);
if (!unchecked.ok) assert.equal(unchecked.error, "review-unverified");

const extra = parseOrderDraft(body({ fontId: "sora" }));
assert.equal(extra.ok, false);
if (!extra.ok) assert.equal(extra.error, "unexpected-field");

const sameLink = piece("stand-vivid", "sticker", { businessName: "Barbería Norte", logo: { data: wideLogo } });
const other = piece("stand-dark", "poster", { businessName: "Barbería Norte", logo: { data: wideLogo }, accent: "#112233" });
assert.equal(sameLink.href, other.href);
assert.equal(sameLink.logo?.data, other.logo?.data);
assert.equal(other.accent, "#ffb000");

const preview = parseArtworkPreview({
  version: 7,
  objective: "review",
  url: reviewUrl,
  businessName: "Barbería Norte",
  message: "Dejanos tu reseña",
  logo: null,
  format: "sticker",
  templateId: "stand-vivid",
  accent: "#ff4d00",
});
assert.equal(preview.ok, true);
if (preview.ok) {
  const svg = renderArtworkSvg(preview.artwork);
  const exported = await renderArtworkFile(preview.artwork, "svg");
  assert.equal(svg, exported.body.toString("utf8"));
  assert.equal(decodeSvg(svg, printPixels(80)), reviewUrl);
  const png = await renderArtworkFile(preview.artwork, "png");
  const pdf = await renderArtworkFile(preview.artwork, "pdf");
  assert.equal(png.body.readUInt32BE(16), printPixels(80));
  assert.equal(png.body.readUInt32BE(20), printPixels(80));
  assert.equal(decodePng(png.body), reviewUrl);
  assert.equal(pdf.body.subarray(0, 4).toString("utf8"), "%PDF");
}

const posterFile = piece("stand-classic", "poster", { businessName: "Barbería Norte" });
const posterPng = await renderArtworkFile(posterFile, "png");
assert.equal(posterPng.body.readUInt32BE(16), printPixels(105));
assert.equal(posterPng.body.readUInt32BE(20), printPixels(148));
assert.equal(decodePng(posterPng.body), reviewUrl);
assert.equal(decodeSvg(renderArtworkSvg(posterFile), printPixels(105)), reviewUrl);

for (const templateId of templates) {
  const sticker = piece(templateId, "sticker", { businessName: "Barbería Norte", logo: { data: wideLogo } });
  const png = await renderArtworkFile(sticker, "png");
  assert.equal(decodePng(png.body), reviewUrl, templateId);
  assert.equal(decodeSvg(renderArtworkSvg(sticker), printPixels(80)), reviewUrl, templateId);
}

const pressPalettes = {
  "review-clean": { fontId: "sora", ink: "#202124", accent: "#1a73e8", surface: "#ffffff", foreground: "#202124", background: "#ffffff" },
  "review-dark": { fontId: "sora", ink: "#f5f6f7", accent: "#d2d6dc", surface: "#101114", foreground: "#101114", background: "#ffffff" },
  "review-brand": { fontId: "source", ink: "#1a1a1a", accent: "#0f6e62", surface: "#f7f5f2", foreground: "#1a1a1a", background: "#ffffff" },
} as const;

const publishedPress = (["review-clean", "review-dark", "review-brand"] as const).flatMap((templateId) =>
  (["poster", "sticker"] as const).map((format) => {
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
      ...pressPalettes[templateId],
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok || parsed.draft.artwork.version !== PRESS_ARTWORK_VERSION) throw new Error("press");
    const scene = layoutArtwork(parsed.draft.artwork);
    assert.equal(scene.commands.some((command) => command.type === "star"), false);
    return scene;
  }),
);
assert.equal(
  createHash("sha256").update(JSON.stringify(publishedPress)).digest("hex"),
  "0ecf4dd3eb5ac36e91078d08f69472e0b187e17a6d124bb951007833d9a630f7",
);

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
