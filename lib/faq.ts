import { faqDownloadAnswer, faqPriceAnswer } from "@/lib/commercial-copy";

export type FaqEntry = { question: string; answer: string; kind?: "price" | "download" };

/** Answers describe what the code does today. Update them when behavior changes. */
const BASE_FAQ: FaqEntry[] = [
  {
    question: "¿Qué puede abrir el QR?",
    answer:
      "Un sitio o cualquier enlace, tu perfil de Instagram, TikTok u otra red, un chat de WhatsApp con mensaje listo, tu ubicación en Google Maps, el formulario de reseñas de Google, tu menú o catálogo, un evento, la conexión a tu Wi-Fi, un contacto para agendar o un texto. La creación guiada te pide solo los datos de lo que elijas.",
  },
  {
    question: "¿El código vence o deja de funcionar?",
    answer:
      "No. Es un código estático: guarda directamente el enlace, el Wi-Fi, el contacto o el texto, y no depende de AtajoLab para funcionar. Por eso mismo no se puede cambiar a dónde lleva después de descargarlo; si cambia tu enlace, creás uno nuevo.",
  },
  {
    question: "¿Cuánto cuesta?",
    kind: "price",
    answer: "",
  },
  {
    question: "¿Qué recibo?",
    answer:
      "Tu diseño en el formato que elijas (cartel A6, flyer A5, afiche A4, tarjeta, etiqueta, post cuadrado o historia) en tres archivos: PDF para imprenta, PNG para imprimir en casa o publicar y SVG si un diseñador lo quiere editar. Es un producto digital: no incluye impresión ni envío.",
  },
  {
    question: "¿Cuándo puedo descargar los archivos?",
    kind: "download",
    answer: "",
  },
  {
    question: "Cerré el navegador o cambié de celular. ¿Cómo descargo de nuevo?",
    answer:
      "Entrá a “Recuperar descargas” y escribí el correo que dejaste al comprar. Te enviamos un enlace que sirve una vez y vence a los 30 minutos.",
  },
  {
    question: "¿Puedo cambiar el diseño después de comprar?",
    answer:
      "El pedido guarda el diseño tal como estaba al comprarlo. Si necesitás otro diseño, podés crear un pedido nuevo desde el editor.",
  },
  {
    question: "¿Cómo lo imprimo?",
    answer:
      "Con el PDF podés ir a cualquier imprenta o imprimirlo en casa y recortarlo. Para que el QR se lea bien, imprimilo a tamaño real y sin estirarlo.",
  },
];

/** The FAQ with the price and payment answers that match the real sales state. */
export function getFaqItems(salesOpen: boolean): Array<{ question: string; answer: string }> {
  return BASE_FAQ.map(({ question, answer, kind }) => ({
    question,
    answer: kind === "price" ? faqPriceAnswer(salesOpen) : kind === "download" ? faqDownloadAnswer(salesOpen) : answer,
  }));
}
