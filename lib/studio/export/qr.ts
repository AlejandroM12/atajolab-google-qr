import { QR_QUIET_ZONE, qrMatrix } from "@/lib/print/qr-matrix";

/** Modules of quiet zone on each side. Matches commercial print and the Konva preview. */
export const STUDIO_QR_MARGIN_MODULES = QR_QUIET_ZONE;

export type StudioQrLayout = {
  matrixSize: number;
  cells: number;
  cellMm: number;
  quietMm: number;
};

/** Shared geometry for vector QR drawing inside an element box. */
export function studioQrLayout(href: string, sizeMm: number): StudioQrLayout {
  const matrix = qrMatrix(href);
  const cells = matrix.size + STUDIO_QR_MARGIN_MODULES * 2;
  const cellMm = sizeMm / cells;
  return {
    matrixSize: matrix.size,
    cells,
    cellMm,
    quietMm: STUDIO_QR_MARGIN_MODULES * cellMm,
  };
}
