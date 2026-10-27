import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const qr = require("qrcode/lib/core/qrcode.js") as {
  create(
    text: string,
    options: { errorCorrectionLevel: "M" },
  ): { modules: { size: number; get(row: number, col: number): number } };
};

export const QR_QUIET_ZONE = 4;

export type QrMatrix = {
  size: number;
  dark(row: number, col: number): boolean;
};

export function qrMatrix(href: string): QrMatrix {
  const symbol = qr.create(href, { errorCorrectionLevel: "M" });
  return {
    size: symbol.modules.size,
    dark: (row, col) => symbol.modules.get(row, col) === 1,
  };
}
