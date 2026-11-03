import { contrastRatio, isHexColor } from "@/lib/color";
import { axisAlignedBounds, boxesOverlap, inflateBox } from "@/lib/studio/geometry";
import { qrContrastIssue } from "@/lib/studio/qr-rules";
import {
  QR_MIN_CONTRAST,
  type DesignDocumentV8,
  type QrElement,
  type StudioElement,
  type TextElement,
} from "@/lib/studio/types";

export const QR_QUIET_MM = 2;

export type DesignWarning = {
  code: "qr-covered" | "qr-contrast" | "text-contrast" | "text-contrast-uncertain";
  message: string;
  elementId: string | null;
  blocking: boolean;
};

export type DesignValidation = {
  warnings: DesignWarning[];
  ready: boolean;
  coveredBy: { id: string; label: string }[];
};

export function quietZonePadding(qr: QrElement): number {
  return Math.max(QR_QUIET_MM, mmApprox(qr.width * 0.08));
}

export function qrProtectedBounds(qr: QrElement) {
  return inflateBox(axisAlignedBounds(qr), quietZonePadding(qr));
}

export function shortElementLabel(element: StudioElement): string {
  if (element.type === "qr") return "Código QR";
  if (element.type === "rect") return "Rectángulo";
  if (element.type === "image") return element.alt || "Imagen";
  const text = element.text.trim();
  return text ? text.slice(0, 28) : "Texto";
}

export function elementsCoveringQr(document: DesignDocumentV8): { id: string; label: string }[] {
  const qr = document.elements.find((item): item is QrElement => item.type === "qr");
  if (!qr) return [];
  const qrIndex = document.elements.findIndex((item) => item.id === qr.id);
  const zone = qrProtectedBounds(qr);
  const covered: { id: string; label: string }[] = [];
  for (let index = qrIndex + 1; index < document.elements.length; index += 1) {
    const element = document.elements[index]!;
    if (element.type === "qr") continue;
    if (boxesOverlap(zone, axisAlignedBounds(element))) {
      covered.push({ id: element.id, label: shortElementLabel(element) });
    }
  }
  return covered;
}

export function validateDesign(document: DesignDocumentV8): DesignValidation {
  const warnings: DesignWarning[] = [];
  const qr = document.elements.find((item): item is QrElement => item.type === "qr");
  const coveredBy = elementsCoveringQr(document);

  if (qr) {
    const contrast = qrContrastIssue(qr.foreground, qr.background);
    if (contrast) {
      warnings.push({
        code: "qr-contrast",
        message: contrast.message,
        elementId: qr.id,
        blocking: true,
      });
    }
  }

  if (coveredBy.length > 0) {
    const names = coveredBy.map((item) => item.label).join(", ");
    warnings.push({
      code: "qr-covered",
      message:
        coveredBy.length === 1
          ? `“${names}” tapa el código QR o su margen. Traé el QR al frente o mové ese elemento.`
          : `Estos elementos tapan el código QR o su margen: ${names}. Traé el QR al frente o movelos.`,
      elementId: coveredBy[0]?.id ?? qr?.id ?? null,
      blocking: true,
    });
  }

  for (const element of document.elements) {
    if (element.type !== "text") continue;
    warnings.push(...textContrastWarnings(document, element));
  }

  return {
    warnings,
    coveredBy,
    ready: warnings.every((warning) => !warning.blocking),
  };
}

function textContrastWarnings(document: DesignDocumentV8, element: TextElement): DesignWarning[] {
  if (!isHexColor(element.fill)) {
    return [
      {
        code: "text-contrast-uncertain",
        message: `No pudimos comprobar el contraste de “${shortElementLabel(element)}”.`,
        elementId: element.id,
        blocking: false,
      },
    ];
  }

  const behind = topOpaqueBehind(document, element);
  if (behind === "uncertain") {
    return [
      {
        code: "text-contrast-uncertain",
        message: `“${shortElementLabel(element)}” está sobre una imagen u otra forma. Revisá que se lea bien.`,
        elementId: element.id,
        blocking: false,
      },
    ];
  }

  const ratio = contrastRatio(element.fill, behind);
  if (ratio < 3) {
    return [
      {
        code: "text-contrast",
        message: `“${shortElementLabel(element)}” casi no se distingue del fondo. Cambiá el color del texto o del fondo.`,
        elementId: element.id,
        blocking: false,
      },
    ];
  }
  if (ratio < QR_MIN_CONTRAST) {
    return [
      {
        code: "text-contrast",
        message: `“${shortElementLabel(element)}” se lee justo. Para impresión conviene más contraste.`,
        elementId: element.id,
        blocking: false,
      },
    ];
  }
  return [];
}

function topOpaqueBehind(document: DesignDocumentV8, text: TextElement): string | "uncertain" {
  const textBox = axisAlignedBounds(text);
  const index = document.elements.findIndex((item) => item.id === text.id);
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = document.elements[i]!;
    if (!boxesOverlap(textBox, axisAlignedBounds(candidate))) continue;
    if (candidate.type === "image") return "uncertain";
    if (candidate.type === "qr") return candidate.background;
    if (candidate.type === "rect") return candidate.fill;
  }
  return document.background;
}

function mmApprox(value: number): number {
  return Math.round(value * 100) / 100;
}
