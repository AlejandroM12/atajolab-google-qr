/**
 * Rules of the last step of the editor ("Obtener mi QR"), free of React so they
 * can be tested: what this browser can get right now, and how each failure is
 * explained. Client-safe.
 *
 * The server decides everything that matters (free claim, price, payment); this
 * module only turns its answers into a state the screen can explain.
 */

/** What POST /api/studio/draft reports about this browser and the shop. */
export type AccessAnswer = {
  /** This browser can still get its free first QR. */
  free: boolean;
  /** The "first QR free" promotion is running. */
  promo: boolean;
  /** New paid orders are open (checkout switch on). */
  sales: boolean;
  /** A Mercado Pago credential is configured for the current environment. */
  payments: boolean;
};

export type AccessState =
  | { kind: "checking" }
  | { kind: "free" }
  | { kind: "paid" }
  /** Nothing can be obtained right now, for a known reason. */
  | { kind: "closed"; reason: "free-used" | "sales-closed" | "payments-pending" }
  /** The check itself failed; the answer is unknown. */
  | { kind: "error"; reason: "connection" | "busy" | "service" | "session" };

export function readAccessAnswer(payload: unknown): AccessAnswer | null {
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;
  if (record.ok !== true) return null;
  return {
    free: record.freeFirst === true,
    promo: record.promo === true,
    sales: record.sales === true,
    payments: record.payments === true,
  };
}

export function accessFromAnswer(answer: AccessAnswer): AccessState {
  if (answer.free) return { kind: "free" };
  if (answer.sales && answer.payments) return { kind: "paid" };
  if (answer.sales) return { kind: "closed", reason: "payments-pending" };
  return { kind: "closed", reason: answer.promo ? "free-used" : "sales-closed" };
}

/** `status` is the HTTP status of the failed check, or null when the request never got an answer. */
export function accessFromFailure(status: number | null): AccessState {
  if (status === null) return { kind: "error", reason: "connection" };
  if (status === 429) return { kind: "error", reason: "busy" };
  if (status === 403) return { kind: "error", reason: "session" };
  return { kind: "error", reason: "service" };
}

export type ProblemAction = "retry" | "fix" | "reload" | "recover" | "support" | "wait";

export type Problem = {
  kind: "service" | "design" | "connection" | "payments" | "access" | "form" | "used" | "unexpected";
  title: string;
  message: string;
  /** What helps: the screen offers the matching button or link. */
  action: ProblemAction;
};

const SERVICE: Problem = {
  kind: "service",
  title: "El servicio no está disponible en este momento",
  message: "Es un problema nuestro y suele durar poco. Tu diseño quedó guardado: probá de nuevo en unos minutos.",
  action: "retry",
};

const CONNECTION: Problem = {
  kind: "connection",
  title: "No pudimos conectarnos",
  message: "Revisá tu conexión a internet y probá de nuevo. Tu diseño quedó guardado.",
  action: "retry",
};

const BUSY: Problem = {
  kind: "service",
  title: "Hiciste muchos intentos seguidos",
  message: "Por seguridad hay un límite. Esperá unos minutos y probá de nuevo.",
  action: "wait",
};

const SESSION: Problem = {
  kind: "access",
  title: "La sesión de este diseño venció",
  message: "Recargá la página: tu diseño se conserva y vas a poder continuar.",
  action: "reload",
};

const PAYMENTS: Problem = {
  kind: "payments",
  title: "Todavía no podemos tomar pagos",
  message:
    "La compra en línea no está habilitada por ahora. Tu diseño quedó guardado en este navegador. Si necesitás el archivo, escribinos.",
  action: "support",
};

/** Why the screen cannot offer anything, when the check answered. */
export function closedProblem(reason: "free-used" | "sales-closed" | "payments-pending"): Problem {
  if (reason === "free-used") {
    return {
      kind: "used",
      title: "Ya usaste tu QR gratis en este navegador",
      message:
        "Es uno por navegador y por correo, y la compra de más diseños todavía no está habilitada. Tu QR anterior sigue disponible: podés volver a descargarlo con tu correo.",
      action: "recover",
    };
  }
  return PAYMENTS;
}

export function accessProblem(reason: "connection" | "busy" | "service" | "session"): Problem {
  if (reason === "connection") return CONNECTION;
  if (reason === "busy") return BUSY;
  if (reason === "session") return SESSION;
  return SERVICE;
}

/**
 * Explains a failed order or checkout. `code` is the `error` field of the API
 * answer, or null when the request did not get one (no connection).
 */
export function orderProblem(code: string | null): Problem {
  if (code === null) return CONNECTION;

  switch (code) {
    case "rate-limited":
    case "preference-limit":
      return BUSY;

    case "database-unavailable":
    case "order-failed":
    case "payment-provider":
    case "draft-failed":
    case "upload-failed":
      return code === "payment-provider"
        ? {
            kind: "service",
            title: "Mercado Pago no respondió",
            message: "Tu pedido quedó creado y no se cobró nada. Probá de nuevo en unos minutos.",
            action: "retry",
          }
        : SERVICE;

    case "studio-not-ready":
    case "composition":
    case "composition-invalid":
    case "studio-embedded-image":
    case "invalid-body":
    case "unexpected-field":
      return {
        kind: "design",
        title: "Hay algo para corregir en el diseño",
        message:
          "Revisá que el código tenga su contenido, que nada lo tape y que todo quede dentro de la hoja. Después probá de nuevo.",
        action: "fix",
      };

    case "studio-checkout-disabled":
    case "checkout-unavailable":
    case "payments-not-configured":
      return PAYMENTS;

    case "studio-draft-key":
    case "origin-rejected":
    case "studio-assets":
    case "studio-idempotency-key":
    case "studio-idempotency-conflict":
      return SESSION;

    case "checkout-unauthorized":
    case "not-found":
      return {
        kind: "access",
        title: "Este navegador no tiene acceso a ese pedido",
        message: "Abrilo desde el navegador donde lo creaste, o recuperá el acceso con tu correo.",
        action: "recover",
      };

    case "free-already-used":
      return {
        kind: "used",
        title: "Ese correo ya usó su QR gratis",
        message: "Es uno por navegador y por correo. Podés volver a descargar el anterior con tu correo.",
        action: "recover",
      };

    case "invalid-email":
      return {
        kind: "form",
        title: "Revisá el correo",
        message: "Tiene que ser una dirección válida: ahí te mandamos el acceso a tus archivos.",
        action: "fix",
      };

    case "terms-required":
      return {
        kind: "form",
        title: "Falta aceptar los términos",
        message: "Para continuar tenés que aceptar los términos y la política de privacidad.",
        action: "fix",
      };

    case "order-not-pending":
      return {
        kind: "access",
        title: "Ese pedido ya no está pendiente de pago",
        message: "Abrí el pedido para ver su estado y descargar los archivos.",
        action: "reload",
      };

    case "order-price":
      return {
        kind: "design",
        title: "El precio cambió",
        message: "Volvé a intentar desde el editor para ver el precio actual.",
        action: "retry",
      };

    default:
      return {
        kind: "unexpected",
        title: "Algo salió mal de nuestro lado",
        message: "No se cobró nada y tu diseño quedó guardado. Probá de nuevo; si sigue pasando, escribinos.",
        action: "support",
      };
  }
}
