import { isStudioAssetRef } from "@/lib/studio/assets/refs";
import { imageSrcIssue } from "@/lib/studio/images";
import { axisAlignedBounds } from "@/lib/studio/geometry";
import { STUDIO_PRINT_DPI } from "@/lib/studio/export/units";
import {
  A6_HEIGHT_MM,
  A6_WIDTH_MM,
  QR_MIN_MM,
  type DesignDocumentV8,
  type ImageElement,
  type QrElement,
  type StudioElement,
} from "@/lib/studio/types";
import { shortElementLabel, validateDesign, type DesignWarning } from "@/lib/studio/validation";

export type ExportIssue = {
  code:
    | DesignWarning["code"]
    | "missing-qr"
    | "qr-empty"
    | "qr-url"
    | "qr-size"
    | "out-of-bounds"
    | "image-src"
    | "low-res-image";
  message: string;
  elementId: string | null;
  blocking: boolean;
};

export type ExportValidation = {
  issues: ExportIssue[];
  warnings: ExportIssue[];
  errors: ExportIssue[];
  ready: boolean;
};

/** Soft bleed tolerance before flagging an element as outside the printable sheet. */
const BOUNDS_SLACK_MM = 0.5;
/** Warn when an image would print below ~150 dpi at its placed size. */
const MIN_IMAGE_DPI = 150;

export function validateForExport(document: DesignDocumentV8): ExportValidation {
  const design = validateDesign(document);
  const issues: ExportIssue[] = design.warnings.map((warning) => ({
    code: warning.code,
    message: warning.message,
    elementId: warning.elementId,
    blocking: warning.blocking,
  }));

  const qr = document.elements.find((element): element is QrElement => element.type === "qr");
  if (!qr) {
    issues.push({
      code: "missing-qr",
      message: "El cartel necesita un código QR para exportar.",
      elementId: null,
      blocking: true,
    });
  } else {
    const value = qr.value.trim();
    if (!value) {
      issues.push({
        code: "qr-empty",
        message: "Completá el enlace del código QR antes de exportar.",
        elementId: qr.id,
        blocking: true,
      });
    } else if (!isHttpUrl(value)) {
      issues.push({
        code: "qr-url",
        message: "El QR tiene que apuntar a una URL http o https válida.",
        elementId: qr.id,
        blocking: true,
      });
    }
    if (Math.min(qr.width, qr.height) + 0.05 < QR_MIN_MM) {
      issues.push({
        code: "qr-size",
        message: `El código QR tiene que medir al menos ${QR_MIN_MM} mm de lado.`,
        elementId: qr.id,
        blocking: true,
      });
    }
  }

  for (const element of document.elements) {
    issues.push(...boundsIssues(element));
    if (element.type === "image") issues.push(...imageIssues(element));
  }

  const errors = issues.filter((issue) => issue.blocking);
  const warnings = issues.filter((issue) => !issue.blocking);
  return {
    issues,
    warnings,
    errors,
    ready: errors.length === 0,
  };
}

function boundsIssues(element: StudioElement): ExportIssue[] {
  const box = axisAlignedBounds(element);
  const outside =
    box.x < -BOUNDS_SLACK_MM ||
    box.y < -BOUNDS_SLACK_MM ||
    box.x + box.width > A6_WIDTH_MM + BOUNDS_SLACK_MM ||
    box.y + box.height > A6_HEIGHT_MM + BOUNDS_SLACK_MM;
  if (!outside) return [];
  return [
    {
      code: "out-of-bounds",
      message: `“${shortElementLabel(element)}” se sale del área imprimible A6.`,
      elementId: element.id,
      blocking: true,
    },
  ];
}

function imageIssues(element: ImageElement): ExportIssue[] {
  const srcIssue = imageSrcIssue(element.src);
  if (srcIssue) {
    return [
      {
        code: "image-src",
        message:
          srcIssue === "size"
            ? `“${shortElementLabel(element)}” es demasiado pesada para exportar.`
            : `“${shortElementLabel(element)}” no es un PNG, JPG o WebP usable.`,
        elementId: element.id,
        blocking: true,
      },
    ];
  }

  // Private asset refs are validated for ownership at order/export time; pixel DPI needs hydration.
  if (isStudioAssetRef(element.src)) return [];

  const pixels = imagePixelSize(element.src);
  if (!pixels) return [];
  const widthInch = element.width / 25.4;
  const heightInch = element.height / 25.4;
  if (widthInch <= 0 || heightInch <= 0) return [];
  const dpi = Math.min(pixels.width / widthInch, pixels.height / heightInch);
  if (dpi + 0.5 >= MIN_IMAGE_DPI) return [];
  return [
    {
      code: "low-res-image",
      message: `“${shortElementLabel(element)}” se ve baja de resolución al imprimir (~${Math.round(dpi)} dpi; conviene ≥${MIN_IMAGE_DPI}).`,
      elementId: element.id,
      blocking: false,
    },
  ];
}

function imagePixelSize(src: string): { width: number; height: number } | null {
  const match = /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/]+={0,2})$/i.exec(src);
  if (!match) return null;
  try {
    const bytes = base64ToBytes(match[2]!);
    if (match[1]!.toLowerCase() === "png" && bytes.length >= 24) {
      return { width: readU32(bytes, 16), height: readU32(bytes, 20) };
    }
    if (match[1]!.toLowerCase() === "jpeg") return jpegSize(bytes);
  } catch {
    return null;
  }
  return null;
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: (bytes[offset + 5]! << 8) | bytes[offset + 6]!,
        width: (bytes[offset + 7]! << 8) | bytes[offset + 8]!,
      };
    }
    offset += 2 + length;
  }
  return null;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0
  );
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export { MIN_IMAGE_DPI, STUDIO_PRINT_DPI };
