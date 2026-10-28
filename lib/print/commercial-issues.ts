export type CommercialIssue = "title-overflow" | "subtitle-overflow" | "composition" | "accent-contrast";

export function isCommercialIssue(value: string): value is CommercialIssue {
  return (
    value === "title-overflow" ||
    value === "subtitle-overflow" ||
    value === "composition" ||
    value === "accent-contrast"
  );
}

export function commercialIssueMessage(issue: CommercialIssue): string {
  if (issue === "title-overflow") {
    return "El título no entra en esta plantilla, ni aunque se achique. Acortalo para continuar.";
  }
  if (issue === "subtitle-overflow") {
    return "La frase no entra en esta plantilla. Acortala para continuar.";
  }
  if (issue === "accent-contrast") {
    return "El color de acento no se distingue del texto. Elegí un acento más claro o más oscuro.";
  }
  return "Con este texto y este logo la pieza no cierra. Probá un texto más corto o un logo más simple.";
}
