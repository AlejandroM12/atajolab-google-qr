"use client";

import { useEffect, useRef, useState } from "react";
import type Konva from "konva";
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import QRCode from "qrcode";
import {
  A6_HEIGHT_MM,
  A6_WIDTH_MM,
  QR_INK,
  QR_MAX_MM,
  QR_MIN_MM,
  QR_PAPER,
  type DesignDocumentV8,
  type ElementBox,
  type ImageElement,
  type QrElement,
  type RectElement,
  type StudioElement,
  type StudioFont,
  type TextElement,
} from "@/lib/studio/types";

type StudioCanvasProps = {
  document: DesignDocumentV8;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onGeometry: (id: string, box: ElementBox) => ElementBox;
};

const FALLBACK_FONTS: Record<StudioFont, string> = {
  source: "Source Sans 3, sans-serif",
  sora: "Sora, sans-serif",
  fraunces: "Fraunces, Georgia, serif",
};

export function StudioCanvas({ document, selectedId, onSelect, onGeometry }: StudioCanvasProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodes = useRef(new Map<string, Konva.Node>());
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [fonts] = useState(readFonts);
  const qr = document.elements.find((element): element is QrElement => element.type === "qr");
  const qrPicture = useQrPicture(qr?.value ?? "", qr?.foreground ?? QR_INK, qr?.background ?? QR_PAPER);
  const px = size.width / A6_WIDTH_MM;
  const selected = document.elements.find((element) => element.id === selectedId) ?? null;

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const measure = () => {
      const bounds = shell.getBoundingClientRect();
      const maxHeight = Math.min(window.innerHeight * 0.68, 860);
      const ratio = A6_HEIGHT_MM / A6_WIDTH_MM;
      let width = bounds.width;
      let height = width * ratio;
      if (height > maxHeight && maxHeight > 0) {
        height = maxHeight;
        width = height / ratio;
      }
      const next = { width: Math.max(0, Math.round(width)), height: Math.max(0, Math.round(height)) };
      setSize((current) => (current.width === next.width && current.height === next.height ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = selectedId ? nodes.current.get(selectedId) : undefined;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, document.elements, size.width, size.height]);

  function commitNode(id: string) {
    const node = nodes.current.get(id);
    if (!node || px <= 0) return;
    const committed = onGeometry(id, readBox(node, px));
    applyBox(node, committed, px);
  }

  return (
    <div ref={shellRef} className="w-full" aria-label="Lienzo del cartel A6">
      {size.width === 0 ? (
        <p className="py-16 text-center text-sm text-muted" role="status">
          Preparando el lienzo…
        </p>
      ) : (
        <div className="mx-auto" style={{ width: size.width }}>
          <div
            className="studio-canvas-surface overflow-hidden rounded-2xl shadow-[0_18px_40px_rgba(20,34,31,0.16)]"
            style={{ width: size.width, height: size.height }}
          >
            <Stage
              width={size.width}
              height={size.height}
              onMouseDown={(event) => {
                if (event.target === event.target.getStage()) onSelect(null);
              }}
              onTouchStart={(event) => {
                if (event.target === event.target.getStage()) onSelect(null);
              }}
            >
              <Layer>
                <Rect
                  x={0}
                  y={0}
                  width={size.width}
                  height={size.height}
                  fill={document.background}
                  listening={false}
                />
                {document.elements.map((element) => {
                  const shared = {
                    element,
                    px,
                    stageWidth: size.width,
                    stageHeight: size.height,
                    register: (node: Konva.Node | null) => {
                      if (node) nodes.current.set(element.id, node);
                      else nodes.current.delete(element.id);
                    },
                    onSelect: () => onSelect(element.id),
                    onCommit: () => commitNode(element.id),
                  };
                  if (element.type === "text") return <TextNode key={element.id} {...shared} element={element} fonts={fonts} />;
                  if (element.type === "rect") return <RectNode key={element.id} {...shared} element={element} />;
                  if (element.type === "image") return <ImageNode key={element.id} {...shared} element={element} />;
                  return <QrNode key={element.id} {...shared} element={element} picture={qrPicture.picture} />;
                })}
                <Transformer
                  ref={transformerRef}
                  rotateEnabled
                  flipEnabled={false}
                  keepRatio={selected?.type === "qr" || selected?.type === "image"}
                  enabledAnchors={anchorsFor(selected?.type)}
                  borderStroke="#0f6e62"
                  anchorStroke="#0f6e62"
                  anchorFill="#fffcf8"
                  anchorSize={12}
                  anchorCornerRadius={4}
                  rotateAnchorOffset={28}
                  rotationSnaps={[0, 90, 180, 270]}
                  rotationSnapTolerance={4}
                  boundBoxFunc={(oldBox, newBox) => {
                    if (newBox.width < 12 || newBox.height < 12) return oldBox;
                    if (selected?.type === "qr") {
                      const min = QR_MIN_MM * px;
                      const max = Math.min(QR_MAX_MM * px, size.width, size.height);
                      if (newBox.width < min || newBox.height < min) return oldBox;
                      if (newBox.width > max || newBox.height > max) return oldBox;
                    }
                    return newBox;
                  }}
                />
              </Layer>
            </Stage>
          </div>
          <p className="mt-2 text-center text-xs text-muted">A6 · 105 × 148 mm</p>
          {qrPicture.failed ? (
            <p className="mt-1 text-center text-sm text-danger" role="alert">
              No pudimos armar el QR con ese texto. Probá con un enlace más corto.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function TextNode({
  element,
  px,
  stageWidth,
  stageHeight,
  fonts,
  register,
  onSelect,
  onCommit,
}: NodeProps & { element: TextElement; fonts: Record<StudioFont, string> }) {
  return (
    <Text
      ref={register}
      {...placement(element, px)}
      text={element.text}
      fontSize={element.fontSize * px}
      fontFamily={fonts[element.font]}
      fill={element.fill}
      align={element.align}
      lineHeight={1.15}
      wrap="word"
      draggable
      dragBoundFunc={(pos) => dragLimit(element, pos, px, stageWidth, stageHeight)}
      onMouseDown={selectOnly(onSelect)}
      onTap={selectOnly(onSelect)}
      onDragEnd={onCommit}
      onTransformEnd={onCommit}
    />
  );
}

function RectNode({
  element,
  px,
  stageWidth,
  stageHeight,
  register,
  onSelect,
  onCommit,
}: NodeProps & { element: RectElement }) {
  return (
    <Rect
      ref={register}
      {...placement(element, px)}
      fill={element.fill}
      cornerRadius={element.cornerRadius * px}
      draggable
      dragBoundFunc={(pos) => dragLimit(element, pos, px, stageWidth, stageHeight)}
      onMouseDown={selectOnly(onSelect)}
      onTap={selectOnly(onSelect)}
      onDragEnd={onCommit}
      onTransformEnd={onCommit}
    />
  );
}

function ImageNode({
  element,
  px,
  stageWidth,
  stageHeight,
  register,
  onSelect,
  onCommit,
}: NodeProps & { element: ImageElement }) {
  const picture = useHtmlImage(element.src);
  if (!picture) {
    return (
      <Group
        ref={register}
        {...placement(element, px)}
        draggable
        dragBoundFunc={(pos) => dragLimit(element, pos, px, stageWidth, stageHeight)}
        onMouseDown={selectOnly(onSelect)}
        onTap={selectOnly(onSelect)}
        onDragEnd={onCommit}
        onTransformEnd={onCommit}
      >
        <Rect width={element.width * px} height={element.height * px} fill="#efe8dc" stroke="#8d8474" dash={[6, 4]} />
        <Text
          width={element.width * px}
          height={element.height * px}
          text="Imagen"
          align="center"
          verticalAlign="middle"
          fontSize={Math.max(12, 4 * px)}
          fill="#5c675f"
          listening={false}
        />
      </Group>
    );
  }
  return (
    <KonvaImage
      ref={register}
      {...placement(element, px)}
      image={picture}
      draggable
      dragBoundFunc={(pos) => dragLimit(element, pos, px, stageWidth, stageHeight)}
      onMouseDown={selectOnly(onSelect)}
      onTap={selectOnly(onSelect)}
      onDragEnd={onCommit}
      onTransformEnd={onCommit}
    />
  );
}

function QrNode({
  element,
  px,
  stageWidth,
  stageHeight,
  picture,
  register,
  onSelect,
  onCommit,
}: NodeProps & { element: QrElement; picture: HTMLImageElement | null }) {
  const width = element.width * px;
  const height = element.height * px;
  const quiet = Math.max(1.5 * px, Math.min(width, height) * 0.08);
  const inner = Math.max(1, Math.min(width, height) - quiet * 2);
  return (
    <Group
      ref={register}
      {...placement(element, px)}
      draggable
      dragBoundFunc={(pos) => dragLimit(element, pos, px, stageWidth, stageHeight)}
      onMouseDown={selectOnly(onSelect)}
      onTap={selectOnly(onSelect)}
      onDragEnd={onCommit}
      onTransformEnd={onCommit}
    >
      <Rect width={width} height={height} fill={element.background} />
      {picture ? (
        <KonvaImage x={quiet} y={quiet} width={inner} height={inner} image={picture} listening={false} />
      ) : (
        <Text
          x={quiet}
          y={height / 2 - 8}
          width={inner}
          text="QR"
          align="center"
          fontSize={Math.max(14, 5 * px)}
          fill={element.foreground}
          listening={false}
        />
      )}
    </Group>
  );
}

type NodeProps = {
  px: number;
  stageWidth: number;
  stageHeight: number;
  register: (node: Konva.Node | null) => void;
  onSelect: () => void;
  onCommit: () => void;
};

function placement(element: StudioElement, px: number) {
  const width = element.width * px;
  const height = element.height * px;
  return {
    x: (element.x + element.width / 2) * px,
    y: (element.y + element.height / 2) * px,
    offsetX: width / 2,
    offsetY: height / 2,
    width,
    height,
    rotation: element.rotation,
  };
}

function readBox(node: Konva.Node, px: number): ElementBox {
  const width = (node.width() * Math.abs(node.scaleX())) / px;
  const height = (node.height() * Math.abs(node.scaleY())) / px;
  const centerX = node.x() / px;
  const centerY = node.y() / px;
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
    rotation: node.rotation(),
  };
}

function applyBox(node: Konva.Node, box: ElementBox, px: number) {
  const width = box.width * px;
  const height = box.height * px;
  node.scaleX(1);
  node.scaleY(1);
  node.width(width);
  node.height(height);
  node.offsetX(width / 2);
  node.offsetY(height / 2);
  node.x((box.x + box.width / 2) * px);
  node.y((box.y + box.height / 2) * px);
  node.rotation(box.rotation);
}

function dragLimit(
  element: StudioElement,
  pos: { x: number; y: number },
  px: number,
  stageWidth: number,
  stageHeight: number,
) {
  if (element.type === "qr") {
    const halfW = (element.width * px) / 2;
    const halfH = (element.height * px) / 2;
    return {
      x: Math.min(Math.max(pos.x, halfW), stageWidth - halfW),
      y: Math.min(Math.max(pos.y, halfH), stageHeight - halfH),
    };
  }
  const margin = 16;
  return {
    x: Math.min(Math.max(pos.x, margin), stageWidth - margin),
    y: Math.min(Math.max(pos.y, margin), stageHeight - margin),
  };
}

function selectOnly(onSelect: () => void) {
  return (event: Konva.KonvaEventObject<Event>) => {
    event.cancelBubble = true;
    onSelect();
  };
}

function anchorsFor(type: StudioElement["type"] | undefined): string[] {
  if (type === "text") return ["middle-left", "middle-right"];
  if (type === "qr") return ["top-left", "top-right", "bottom-left", "bottom-right"];
  return [
    "top-left",
    "top-center",
    "top-right",
    "middle-left",
    "middle-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
  ];
}

function readFonts(): Record<StudioFont, string> {
  if (typeof document === "undefined") return FALLBACK_FONTS;
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => {
    const value = styles.getPropertyValue(name).trim().replaceAll("\"", "");
    return value ? `${value}, ${fallback}` : fallback;
  };
  return {
    source: read("--font-source", FALLBACK_FONTS.source),
    sora: read("--font-sora", FALLBACK_FONTS.sora),
    fraunces: read("--font-fraunces", FALLBACK_FONTS.fraunces),
  };
}

function useHtmlImage(src: string): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    const picture = new window.Image();
    picture.onload = () => {
      if (!cancelled) setImage(picture);
    };
    picture.onerror = () => {
      if (!cancelled) setImage(null);
    };
    picture.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);
  return image;
}

function useQrPicture(value: string, foreground: string, background: string) {
  const request = `${value}\n${foreground}\n${background}`;
  const [state, setState] = useState<{ request: string; picture: HTMLImageElement | null; failed: boolean } | null>(null);
  useEffect(() => {
    const content = value.trim();
    if (!content) return;
    let cancelled = false;
    QRCode.toDataURL(content, {
      margin: 0,
      width: 512,
      errorCorrectionLevel: "Q",
      color: { dark: foreground, light: background },
    })
      .then((url) => {
        if (cancelled) return;
        const image = new window.Image();
        image.onload = () => {
          if (!cancelled) setState({ request, picture: image, failed: false });
        };
        image.onerror = () => {
          if (!cancelled) setState({ request, picture: null, failed: true });
        };
        image.src = url;
      })
      .catch(() => {
        if (!cancelled) setState({ request, picture: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [value, foreground, background, request]);
  if (!value.trim() || state?.request !== request) return { picture: null, failed: false };
  return { picture: state.picture, failed: state.failed };
}
