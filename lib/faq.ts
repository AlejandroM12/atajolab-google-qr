import { formatArs, PIECE_PRICE_ARS } from "@/lib/pricing";

/** Answers describe what the code does today. Update them when behavior changes. */
export const FAQ_ITEMS: Array<{ question: string; answer: string }> = [
  {
    question: "¿Qué enlace tengo que poner en el QR?",
    answer:
      "El enlace para dejar una reseña en Google (desde tu Perfil de Empresa, opción “Pedir reseñas”) o el enlace de tu negocio en Google Maps (botón “Compartir”). El editor te avisa si el enlace no es de Google.",
  },
  {
    question: "¿Cuánto cuesta?",
    answer: `${formatArs(PIECE_PRICE_ARS)} por cartel, pago único con Mercado Pago. No hay suscripción.`,
  },
  {
    question: "¿Qué recibo?",
    answer:
      "Tu cartel en tamaño A6 (105 × 148 mm) en tres archivos: PDF para imprenta, PNG para imprimir en casa o compartir y SVG si un diseñador lo quiere editar. Es un producto digital: no incluye impresión ni envío.",
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
      "Con el PDF podés ir a cualquier imprenta o imprimirlo en una hoja A4 y recortarlo. Para que el QR se lea bien, imprimilo a tamaño real y sin estirarlo.",
  },
];
