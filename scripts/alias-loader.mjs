export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const fileUrl = new URL(`../${specifier.slice(2)}.ts`, import.meta.url);
    return nextResolve(fileUrl.href, context);
  }
  return nextResolve(specifier, context);
}
