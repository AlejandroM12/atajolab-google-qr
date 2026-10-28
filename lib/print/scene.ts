import type { PrintFontRole } from "@/lib/print/fonts";

export type DrawCommand =
  | { type: "rect"; x: number; y: number; w: number; h: number; fill: string; radius?: number; opacity?: number }
  | {
      type: "stroke";
      x: number;
      y: number;
      w: number;
      h: number;
      color: string;
      width: number;
      radius?: number;
      opacity?: number;
    }
  | {
      type: "circle";
      cx: number;
      cy: number;
      r: number;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      opacity?: number;
    }
  | {
      type: "text";
      text: string;
      x: number;
      y: number;
      width: number;
      size: number;
      role: PrintFontRole;
      color: string;
      align: "left" | "center";
      letterSpacing?: number;
      opacity?: number;
    }
  | { type: "image"; x: number; y: number; w: number; h: number; data: string; radius: number }
  | { type: "qr"; x: number; y: number; size: number; foreground: string; background: string; href: string };

export type ArtworkScene = {
  widthMm: number;
  heightMm: number;
  clipRadius?: number;
  commands: DrawCommand[];
};
