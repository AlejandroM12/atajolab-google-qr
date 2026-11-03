import type { StudioFont, TextAlign } from "@/lib/studio/types";

/** Independent draw list for Studio v8. Coordinates are millimeters on the A6 sheet. */
export type StudioDrawCommand =
  | {
      type: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      fill: string;
      radius: number;
      rotation: number;
    }
  | {
      type: "text";
      lines: string[];
      x: number;
      y: number;
      width: number;
      height: number;
      size: number;
      lineHeight: number;
      font: StudioFont;
      color: string;
      align: TextAlign;
      rotation: number;
    }
  | {
      type: "image";
      x: number;
      y: number;
      w: number;
      h: number;
      dataUrl: string;
      rotation: number;
    }
  | {
      type: "qr";
      x: number;
      y: number;
      size: number;
      foreground: string;
      background: string;
      href: string;
      rotation: number;
    };

export type StudioScene = {
  widthMm: number;
  heightMm: number;
  commands: StudioDrawCommand[];
};
