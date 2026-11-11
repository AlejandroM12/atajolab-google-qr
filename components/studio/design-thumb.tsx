import type { DesignDocumentV8, StudioElement } from "@/lib/studio/types";

/**
 * A small schematic of a design: real geometry and colors, with texts drawn as
 * bars and the code as a plain marker. Cheap enough to redraw on every edit.
 */
export function DesignThumb({ document, className = "" }: { document: DesignDocumentV8; className?: string }) {
  const { widthMm, heightMm } = document.format;
  return (
    <svg
      viewBox={`0 0 ${widthMm} ${heightMm}`}
      className={`block h-auto w-full rounded-md border border-line/70 ${className}`}
      style={{ aspectRatio: `${widthMm} / ${heightMm}` }}
      aria-hidden="true"
    >
      <rect width={widthMm} height={heightMm} fill={document.background} />
      {document.elements.map((element) => (
        <g key={element.id} transform={rotation(element)}>
          <Piece element={element} />
        </g>
      ))}
    </svg>
  );
}

function rotation(element: StudioElement): string | undefined {
  if (!element.rotation) return undefined;
  return `rotate(${element.rotation} ${element.x + element.width / 2} ${element.y + element.height / 2})`;
}

function Piece({ element }: { element: StudioElement }) {
  if (element.type === "rect") {
    return (
      <rect
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        rx={Math.min(element.cornerRadius, element.width / 2, element.height / 2)}
        fill={element.fill}
      />
    );
  }

  if (element.type === "image") {
    return <rect x={element.x} y={element.y} width={element.width} height={element.height} fill="#b9b3a6" />;
  }

  if (element.type === "qr") {
    const cell = element.width / 7;
    const eye = (column: number, row: number) => (
      <rect
        x={element.x + cell * column}
        y={element.y + cell * row}
        width={cell * 2}
        height={cell * 2}
        fill={element.foreground}
      />
    );
    return (
      <>
        <rect x={element.x} y={element.y} width={element.width} height={element.height} fill={element.background} />
        {eye(1, 1)}
        {eye(4, 1)}
        {eye(1, 4)}
        <rect
          x={element.x + cell * 4}
          y={element.y + cell * 4}
          width={cell * 2}
          height={cell * 2}
          fill={element.foreground}
          opacity={0.45}
        />
      </>
    );
  }

  // Text: one bar per line that fits, as long as the words would roughly be.
  const lineHeight = element.fontSize * 1.25;
  const bar = element.fontSize * 0.62;
  const average = element.fontSize * 0.52;
  const perLine = Math.max(1, Math.floor(element.width / average));
  const lines = Math.max(1, Math.min(Math.ceil(element.text.length / perLine), Math.floor(element.height / lineHeight) || 1));
  return (
    <>
      {Array.from({ length: lines }, (_, index) => {
        const chars = index === lines - 1 ? element.text.length - perLine * index : perLine;
        const width = Math.min(element.width, Math.max(average * 2, chars * average));
        const x =
          element.align === "center"
            ? element.x + (element.width - width) / 2
            : element.align === "right"
              ? element.x + element.width - width
              : element.x;
        return (
          <rect
            key={index}
            x={x}
            y={element.y + index * lineHeight + (lineHeight - bar) / 2}
            width={width}
            height={bar}
            rx={bar / 2}
            fill={element.fill}
          />
        );
      })}
    </>
  );
}
