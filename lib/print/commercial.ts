import {
  commercialTemplates,
  type ArtworkFontId,
  type ArtworkLogo,
  type CommercialTemplateId,
  type ProductArtworkV3,
} from "@/lib/artwork";
import type { GoogleLinkGoal } from "@/lib/google-link";
import type { CommercialIssue } from "@/lib/print/commercial-issues";
import { fitText, type FittedText } from "@/lib/print/fit-text";
import type { PrintFontRole } from "@/lib/print/fonts";
import type { ArtworkScene, DrawCommand } from "@/lib/print/scene";
import type { QrSize } from "@/lib/product";

const TITLE_MAX = 8.4;
const TITLE_MIN = 4.6;
const SUB_MAX = 4.2;
const SUB_MIN = 3.2;
const TITLE_STEPS = [8.4, 7.2, 6.2, 5.4, 4.6];
const SUB_STEPS = [4.2, 3.6, 3.2];
const LOGO_HEIGHTS = [13, 9];

export function layoutCommercial(
  artwork: ProductArtworkV3,
): { ok: true; scene: ArtworkScene } | { ok: false; error: CommercialIssue } {
  if (!artwork.href) return { ok: false, error: "composition" };
  const spec = commercialTemplates.find((item) => item.id === artwork.templateId);
  if (!spec) return { ok: false, error: "composition" };

  const href = artwork.href;
  const surface = paint(artwork.surface);
  const ink = paint(artwork.ink);
  const accent = paint(artwork.accent);
  const foreground = paint(artwork.foreground);
  const background = paint(artwork.background);
  const box = textBox(artwork.templateId, spec.widthMm, spec.heightMm);
  const role = titleRole(artwork.fontId);
  const eyebrow = fitEyebrow(artwork.serviceLine, box.w);
  const cue = fitCue(scanCue(artwork.goal), artwork.templateId === "modern-business" ? Math.max(28, box.w - 40) : box.w);
  if (!eyebrow || !cue) return { ok: false, error: "composition" };

  const titleFits = fitText({
    text: artwork.businessName,
    role,
    width: box.w,
    maxSize: TITLE_MAX,
    minSize: TITLE_MIN,
    maxLines: 4,
    leading: 1.28,
  });
  if (!titleFits) return { ok: false, error: "title-overflow" };

  const subtitleFits = fitText({
    text: artwork.subtitle,
    role: "body",
    width: box.w,
    maxSize: SUB_MAX,
    minSize: SUB_MIN,
    maxLines: 4,
    leading: 1.26,
  });
  if (!subtitleFits) return { ok: false, error: "subtitle-overflow" };

  for (const titleMax of TITLE_STEPS) {
    const title = fitText({
      text: artwork.businessName,
      role,
      width: box.w,
      maxSize: titleMax,
      minSize: TITLE_MIN,
      maxLines: 4,
      leading: 1.28,
    });
    if (!title) return { ok: false, error: "title-overflow" };

    for (const subMax of SUB_STEPS) {
      const subtitle = fitText({
        text: artwork.subtitle,
        role: "body",
        width: box.w,
        maxSize: subMax,
        minSize: SUB_MIN,
        maxLines: 4,
        leading: 1.26,
      });
      if (!subtitle) return { ok: false, error: "subtitle-overflow" };

      for (const qr of qrCandidates(artwork.qrSize, artwork.templateId, box.w)) {
        for (const logoH of LOGO_HEIGHTS) {
          const logo = logoSize(artwork.logo, Math.min(34, box.w), logoH);
          const scene = placeTemplate({
            templateId: artwork.templateId,
            goal: artwork.goal,
            href,
            width: spec.widthMm,
            height: spec.heightMm,
            surface,
            ink,
            accent,
            foreground,
            background,
            box,
            role,
            title,
            subtitle,
            eyebrow,
            cue,
            logo,
            logoData: artwork.logo?.data ?? null,
            qr,
          });
          if (scene) return { ok: true, scene };
        }
      }
    }
  }

  return { ok: false, error: "composition" };
}

type Box = { x: number; w: number; top: number; bottom: number };

type Placement = {
  templateId: CommercialTemplateId;
  goal: GoogleLinkGoal;
  href: string;
  width: number;
  height: number;
  surface: string;
  ink: string;
  accent: string;
  foreground: string;
  background: string;
  box: Box;
  role: PrintFontRole;
  title: FittedText;
  subtitle: FittedText;
  eyebrow: FittedText;
  cue: FittedText;
  logo: { w: number; h: number } | null;
  logoData: string | null;
  qr: number;
};

function placeTemplate(input: Placement): ArtworkScene | null {
  if (input.templateId === "minimal-elegant") return placeMinimal(input);
  if (input.templateId === "dark-premium") return placeDark(input);
  if (input.templateId === "modern-business") return placeModern(input);
  return placePop(input);
}

function placeMinimal(input: Placement): ArtworkScene | null {
  const commands: DrawCommand[] = [];
  const pad = 2.4;
  const box = input.qr + pad * 2;
  const gap = 3.4;
  let stack = input.eyebrow.height + gap + input.title.height + 5.4 + input.subtitle.height + 5 + box + 3.2 + input.cue.height;
  if (input.logo) stack += input.logo.h + gap;
  const available = input.box.bottom - input.box.top;
  if (stack > available) return null;

  commands.push(sheet(input));
  commands.push({ type: "stroke", x: 5.2, y: 5.2, w: input.width - 10.4, h: input.height - 10.4, color: input.accent, width: 0.22, radius: 3 });
  commands.push({ type: "stroke", x: 6.8, y: 6.8, w: input.width - 13.6, h: input.height - 13.6, color: input.accent, width: 0.15, radius: 2.2 });

  let y = input.box.top + (available - stack) / 2;
  if (input.logo && input.logoData) {
    placeLogo(commands, input, input.box.x + (input.box.w - input.logo.w) / 2, y, 1.2);
    y += input.logo.h + gap;
  }
  y = pushFitted(commands, input.eyebrow, input.box.x, y, input.box.w, "label", input.accent, "center");
  y += gap;
  y = pushFitted(commands, input.title, input.box.x, y, input.box.w, input.role, input.ink, "center");
  y += 2.2;
  commands.push({
    type: "rect",
    x: input.width / 2 - 7,
    y,
    w: 14,
    h: 0.35,
    fill: input.accent,
  });
  y += 3.2;
  y = pushFitted(commands, input.subtitle, input.box.x, y, input.box.w, "body", input.ink, "center");
  y += 5;
  const qrX = input.width / 2 - box / 2;
  commands.push({ type: "rect", x: qrX, y, w: box, h: box, fill: input.background, radius: 0.8 });
  commands.push(qr(input, qrX + pad, y + pad));
  y += box + 3.2;
  pushFitted(commands, input.cue, input.box.x, y, input.box.w, "label", input.accent, "center");

  return finish(input, commands, 5);
}

function placeDark(input: Placement): ArtworkScene | null {
  const commands: DrawCommand[] = [];
  const pad = 4;
  const box = input.qr + pad * 2;
  const gap = 3.2;
  let stack = input.eyebrow.height + gap + input.title.height + 6 + input.subtitle.height + 5.5 + box + 3.6 + input.cue.height;
  if (input.logo) stack += input.logo.h + gap;
  const available = input.box.bottom - input.box.top;
  if (stack > available) return null;

  commands.push(sheet(input));
  commands.push({ type: "stroke", x: 5.5, y: 5.5, w: input.width - 11, h: input.height - 11, color: input.accent, width: 0.28, radius: 1.4 });
  commands.push({ type: "stroke", x: 7.2, y: 7.2, w: input.width - 14.4, h: input.height - 14.4, color: input.accent, width: 0.16, radius: 1 });
  corner(commands, 4.2, 4.2, input.accent);
  corner(commands, input.width - 7.6, 4.2, input.accent);
  corner(commands, 4.2, input.height - 7.6, input.accent);
  corner(commands, input.width - 7.6, input.height - 7.6, input.accent);

  let y = input.box.top + (available - stack) / 2;
  if (input.logo && input.logoData) {
    placeLogo(commands, input, input.box.x + (input.box.w - input.logo.w) / 2, y, 1.4);
    y += input.logo.h + gap;
  }
  y = pushFitted(commands, input.eyebrow, input.box.x, y, input.box.w, "label", input.accent, "center");
  y += gap;
  y = pushFitted(commands, input.title, input.box.x, y, input.box.w, input.role, input.ink, "center");
  y += 2.4;
  commands.push({ type: "rect", x: input.width / 2 - 12, y: y + 0.7, w: 24, h: 0.28, fill: input.accent });
  commands.push({ type: "circle", cx: input.width / 2, cy: y + 0.84, r: 0.9, fill: input.accent });
  y += 3.6;
  y = pushFitted(commands, input.subtitle, input.box.x, y, input.box.w, "body", input.ink, "center");
  y += 5.5;
  const plaqueX = input.width / 2 - box / 2;
  commands.push({ type: "rect", x: plaqueX, y, w: box, h: box, fill: input.background, radius: 3.2 });
  commands.push({ type: "stroke", x: plaqueX, y, w: box, h: box, color: input.accent, width: 0.4, radius: 3.2 });
  commands.push(qr(input, plaqueX + pad, y + pad));
  y += box + 3.6;
  pushFitted(commands, input.cue, input.box.x, y, input.box.w, "label", input.accent, "center");

  return finish(input, commands, 2.2);
}

function placeModern(input: Placement): ArtworkScene | null {
  const commands: DrawCommand[] = [];
  const pad = 2.2;
  const qrBox = input.qr + pad * 2;
  const cueW = input.box.w - qrBox - 5;
  if (cueW < 26) return null;
  const cue = fitCue(scanCue(input.goal), cueW);
  if (!cue) return null;
  const headerGap = 3;
  let header = input.eyebrow.height + headerGap + input.title.height + 2.6 + input.subtitle.height;
  if (input.logo) header += Math.max(input.logo.h, input.eyebrow.height) - input.eyebrow.height;
  const rowH = Math.max(qrBox, cue.height + 6);
  const minGap = 8;
  const bottom = 8;
  if (input.box.top + header + minGap + rowH > input.height - bottom) return null;
  const spare = input.height - bottom - input.box.top - header - minGap - rowH;
  const gap = minGap + Math.min(6, spare * 0.2);
  const shift = (spare - (gap - minGap)) * 0.5;

  commands.push(sheet(input));
  commands.push({ type: "rect", x: 0, y: 0, w: 6, h: input.height, fill: input.accent });

  let y = input.box.top + shift;
  if (input.logo && input.logoData) {
    placeLogo(commands, input, input.box.x, y, 1.4);
    const eyebrowY = y + Math.max(0, (input.logo.h - input.eyebrow.height) / 2);
    const eyebrowX = input.box.x + input.logo.w + 3.5;
    const eyebrowW = input.box.w - input.logo.w - 3.5;
    if (eyebrowW < 24) return null;
    pushFitted(commands, input.eyebrow, eyebrowX, eyebrowY, eyebrowW, "label", input.accent, "left");
    y += input.logo.h + headerGap;
  } else {
    y = pushFitted(commands, input.eyebrow, input.box.x, y, input.box.w, "label", input.accent, "left");
    y += headerGap;
  }
  y = pushFitted(commands, input.title, input.box.x, y, input.box.w, input.role, input.ink, "left");
  y += 2.6;
  y = pushFitted(commands, input.subtitle, input.box.x, y, input.box.w, "body", input.ink, "left");

  const rowY = y + gap;
  if (rowY + rowH > input.height - bottom) return null;
  commands.push({ type: "rect", x: input.box.x, y: rowY, w: qrBox, h: qrBox, fill: input.background, radius: 1.6 });
  commands.push(qr(input, input.box.x + pad, rowY + pad));
  const cueX = input.box.x + qrBox + 5;
  const cueY = rowY + Math.max(4, (qrBox - cue.height) / 2);
  commands.push({ type: "rect", x: cueX, y: cueY - 2.4, w: 9, h: 0.7, fill: input.accent });
  pushFitted(commands, cue, cueX, cueY, cueW, "label", input.ink, "left");

  return finish(input, commands, 1.6);
}

function placePop(input: Placement): ArtworkScene | null {
  const commands: DrawCommand[] = [];
  const pad = 2.6;
  const qrBox = input.qr + pad * 2;
  const shadow = 2.6;
  const stickerH = qrBox + shadow;
  const gap = 3;
  let topH = input.eyebrow.height + gap + input.title.height + 2.4 + input.subtitle.height + 3 + input.cue.height;
  if (input.logo) topH += input.logo.h + gap;
  const stickerTop = input.height - 8 - stickerH;
  if (input.box.top + topH + 4 > stickerTop) return null;

  commands.push(sheet(input));
  commands.push({ type: "circle", cx: input.width - 10, cy: input.height - 24, r: 18, fill: input.accent });
  commands.push({ type: "circle", cx: input.width - 30, cy: input.height - 10, r: 6.5, fill: input.ink, opacity: 0.9 });

  let y = input.box.top;
  if (input.logo && input.logoData) {
    placeLogo(commands, input, input.box.x, y, 2);
    y += input.logo.h + gap;
  }
  y = pushFitted(commands, input.eyebrow, input.box.x, y, input.box.w, "label", input.accent, "left");
  y += gap;
  y = pushFitted(commands, input.title, input.box.x, y, input.box.w, input.role, input.ink, "left");
  y += 2.4;
  y = pushFitted(commands, input.subtitle, input.box.x, y, input.box.w, "body", input.ink, "left");
  y += 3;
  pushFitted(commands, input.cue, input.box.x, y, input.box.w, "label", input.ink, "left");

  const stickerX = 9;
  commands.push({
    type: "rect",
    x: stickerX + shadow,
    y: stickerTop + shadow,
    w: qrBox,
    h: qrBox,
    fill: input.accent,
    radius: 4,
  });
  commands.push({ type: "rect", x: stickerX, y: stickerTop, w: qrBox, h: qrBox, fill: input.background, radius: 4 });
  commands.push(qr(input, stickerX + pad, stickerTop + pad));
  const dotY = stickerTop - 4.2;
  if (dotY > y + input.cue.height + 2) {
    commands.push({ type: "circle", cx: stickerX + 1.2, cy: dotY, r: 1.05, fill: input.accent });
    commands.push({ type: "circle", cx: stickerX + 5, cy: dotY, r: 1.05, fill: input.ink });
    commands.push({ type: "circle", cx: stickerX + 8.8, cy: dotY, r: 1.05, fill: input.accent });
  }

  return finish(input, commands, 8);
}

function finish(input: Placement, commands: DrawCommand[], clipRadius: number): ArtworkScene | null {
  if (!contentInside(commands, input.width, input.height)) return null;
  if (commands.some((command) => command.type === "text" && command.text.includes("…"))) return null;
  return { widthMm: input.width, heightMm: input.height, clipRadius, commands };
}

function sheet(input: Placement): DrawCommand {
  return { type: "rect", x: 0, y: 0, w: input.width, h: input.height, fill: input.surface };
}

function qr(input: Placement, x: number, y: number): DrawCommand {
  return {
    type: "qr",
    x,
    y,
    size: input.qr,
    foreground: input.foreground,
    background: input.background,
    href: input.href,
  };
}

function corner(commands: DrawCommand[], x: number, y: number, color: string): void {
  commands.push({ type: "stroke", x, y, w: 3.4, h: 3.4, color, width: 0.45 });
}

function placeLogo(commands: DrawCommand[], input: Placement, x: number, y: number, radius: number): void {
  if (!input.logo || !input.logoData) return;
  commands.push({
    type: "image",
    x,
    y,
    w: input.logo.w,
    h: input.logo.h,
    data: input.logoData,
    radius,
  });
}

function pushFitted(
  commands: DrawCommand[],
  fitted: FittedText,
  x: number,
  y: number,
  width: number,
  role: PrintFontRole,
  color: string,
  align: "left" | "center",
): number {
  fitted.lines.forEach((line, index) => {
    commands.push({
      type: "text",
      text: line,
      x,
      y: y + index * fitted.lineHeight,
      width,
      size: fitted.size,
      role,
      color,
      align,
      letterSpacing: fitted.letterSpacing,
    });
  });
  return y + fitted.height;
}

function contentInside(commands: DrawCommand[], width: number, height: number): boolean {
  for (const command of commands) {
    if (command.type === "text") {
      if (command.y < 1 || command.x < 1) return false;
      if (command.y + command.size > height - 1) return false;
      if (command.x + command.width > width - 1) return false;
    }
    if (command.type === "qr") {
      if (command.size < 28) return false;
      if (command.x < 2 || command.y < 2) return false;
      if (command.x + command.size > width - 2 || command.y + command.size > height - 2) return false;
    }
    if (command.type === "image") {
      if (command.x < 1 || command.y < 1) return false;
      if (command.x + command.w > width - 1 || command.y + command.h > height - 1) return false;
    }
  }
  return true;
}

function textBox(id: CommercialTemplateId, width: number, height: number): Box {
  if (id === "modern-business") return { x: 13, w: width - 21, top: 10, bottom: height - 8 };
  if (id === "dark-premium") return { x: 12, w: width - 24, top: 14, bottom: height - 14 };
  if (id === "creative-pop") return { x: 9, w: width - 18, top: 11, bottom: height - 8 };
  return { x: 11, w: width - 22, top: 12, bottom: height - 12 };
}

function qrCandidates(size: QrSize, id: CommercialTemplateId, textWidth: number): number[] {
  const preferred = size === 192 ? 30 : size === 320 ? 38 : 34;
  const cap = id === "modern-business" ? textWidth - 32 : textWidth;
  return [38, 34, 30, 28].filter((value, index, all) => value <= preferred && value <= cap && all.indexOf(value) === index);
}

function logoSize(logo: ArtworkLogo | null, maxW: number, maxH: number): { w: number; h: number } | null {
  if (!logo || logo.width < 1 || logo.height < 1) return null;
  const aspect = logo.width / logo.height;
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  return { w, h };
}

function titleRole(fontId: ArtworkFontId): PrintFontRole {
  if (fontId === "fraunces") return "frauncesBold";
  if (fontId === "sora") return "display";
  return "label";
}

function scanCue(goal: GoogleLinkGoal): string {
  return goal === "ubicacion" ? "Escaneá para llegar" : "Escaneá para opinar";
}

function fitEyebrow(text: string, width: number): FittedText | null {
  return (
    fitText({
      text,
      role: "label",
      width,
      maxSize: 2.7,
      minSize: 2.4,
      maxLines: 1,
      leading: 1.15,
      letterSpacing: 0.14,
    }) ??
    fitText({
      text,
      role: "label",
      width,
      maxSize: 2.6,
      minSize: 2.4,
      maxLines: 1,
      leading: 1.15,
      letterSpacing: 0.02,
    })
  );
}

function fitCue(text: string, width: number): FittedText | null {
  return (
    fitText({
      text,
      role: "label",
      width,
      maxSize: 3.4,
      minSize: 2.6,
      maxLines: 2,
      leading: 1.2,
      letterSpacing: 0.04,
    }) ??
    fitText({
      text,
      role: "label",
      width,
      maxSize: 3.2,
      minSize: 2.4,
      maxLines: 2,
      leading: 1.2,
    })
  );
}

function paint(value: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error("artwork-color");
  return value.toLowerCase();
}
