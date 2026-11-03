import { wrapStudioText } from "@/lib/studio/export/wrap";
import type { StudioDrawCommand, StudioScene } from "@/lib/studio/export/scene";
import type { DesignDocumentV8, StudioElement } from "@/lib/studio/types";

/** Compile a DesignDocument into a print scene. Parked elements are ignored. */
export function compileStudioScene(document: DesignDocumentV8): StudioScene {
  const commands: StudioDrawCommand[] = [
    {
      type: "rect",
      x: 0,
      y: 0,
      w: document.format.widthMm,
      h: document.format.heightMm,
      fill: document.background,
      radius: 0,
      rotation: 0,
    },
  ];

  for (const element of document.elements) {
    commands.push(compileElement(element));
  }

  return {
    widthMm: document.format.widthMm,
    heightMm: document.format.heightMm,
    commands,
  };
}

function compileElement(element: StudioElement): StudioDrawCommand {
  if (element.type === "rect") {
    return {
      type: "rect",
      x: element.x,
      y: element.y,
      w: element.width,
      h: element.height,
      fill: element.fill,
      radius: Math.max(0, element.cornerRadius),
      rotation: element.rotation,
    };
  }

  if (element.type === "text") {
    const wrapped = wrapStudioText({
      text: element.text,
      font: element.font,
      fontSize: element.fontSize,
      width: element.width,
    });
    return {
      type: "text",
      lines: wrapped.lines,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      size: element.fontSize,
      lineHeight: wrapped.lineHeight,
      font: element.font,
      color: element.fill,
      align: element.align,
      rotation: element.rotation,
    };
  }

  if (element.type === "image") {
    return {
      type: "image",
      x: element.x,
      y: element.y,
      w: element.width,
      h: element.height,
      dataUrl: element.src,
      rotation: element.rotation,
    };
  }

  return {
    type: "qr",
    x: element.x,
    y: element.y,
    size: Math.min(element.width, element.height),
    foreground: element.foreground,
    background: element.background,
    href: element.value.trim(),
    rotation: element.rotation,
  };
}
