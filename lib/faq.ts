import { formatArs, PIECE_PRICE_ARS } from "@/lib/pricing";

/** Answers describe what the code does today. Update them when behavior changes. */
export const FAQ_ITEMS: Array<{ question: string; answer: string }> = [
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
    answer: `${formatArs(PIECE_PRICE_ARS)} por cartel, pago único con Mercado Pago. No hay suscripción.`,
  },
  {
    question: "¿Qué recibo?",
    answer:
      "Tu diseño en el formato que elijas (cartel A6, flyer A5, afiche A4, tarjeta, etiqueta, post cuadrado o historia) en tres archivos: PDF para imprenta, PNG para imprimir en casa o publicar y SVG si un diseñador lo quiere editar. Es un producto digital: no incluye impresión ni envío.",
  },
  {
    question: "¿Cuándo puedo descargar los archivos?",
    answer:
      "Apenas Mercado Pago aprueba el pago. La página del pedido se actualiza sola. Si pagaste en efectivo, la aprobación puede demorar más.",
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
