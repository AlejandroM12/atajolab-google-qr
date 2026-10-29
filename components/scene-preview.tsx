export function ScenePreview({ svg }: { svg: string }) {
  const markup = svg.replace(/^\s*<\?xml[^>]*>\s*/, "");
  return (
    <div
      aria-label="Vista previa del diseño"
      className="mx-auto w-full max-w-[20rem] [&_svg]:h-auto [&_svg]:w-full"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
