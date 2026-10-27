"use client";

import { useEffect, useRef, useState } from "react";
import type { QrSize } from "@/lib/product";

export type QrPayload = {
  key: string;
  href: string;
  foreground: string;
  background: string;
  size: QrSize;
};

type QrPhase = "idle" | "loading" | "ready" | "error";

export function QrSlot({
  payload,
  onPhase,
}: {
  payload: QrPayload | null;
  onPhase?: (phase: QrPhase) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onPhaseRef = useRef<(phase: QrPhase) => void>(() => undefined);
  const [render, setRender] = useState<{ key: string; phase: "ready" | "error" } | null>(null);
  const ready = Boolean(payload && render?.key === payload.key && render.phase === "ready");
  const failed = Boolean(payload && render?.key === payload.key && render.phase === "error");

  useEffect(() => {
    onPhaseRef.current = onPhase ?? (() => undefined);
  }, [onPhase]);

  useEffect(() => {
    if (!payload) {
      onPhaseRef.current("idle");
      return;
    }

    const current = payload;
    let cancelled = false;
    onPhaseRef.current("loading");

    void (async () => {
      try {
        const QRCode = await import("qrcode");
        if (cancelled || !canvasRef.current) return;
        const canvas = canvasRef.current;
        await QRCode.toCanvas(canvas, current.href, {
          errorCorrectionLevel: "M",
          margin: 4,
          width: current.size,
          color: { dark: current.foreground, light: current.background },
        });
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        if (!cancelled) {
          setRender({ key: current.key, phase: "ready" });
          onPhaseRef.current("ready");
        }
      } catch {
        if (!cancelled) {
          setRender({ key: current.key, phase: "error" });
          onPhaseRef.current("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [payload]);

  return (
    <div className="h-full w-full">
      <canvas
        ref={canvasRef}
        className={ready ? "block h-full w-full" : "hidden"}
        role={ready ? "img" : undefined}
        aria-label={ready ? "Código QR de la pieza" : undefined}
        aria-hidden={ready ? undefined : true}
      />
      {ready ? null : (
        <div className="grid aspect-square place-items-center rounded-md border border-dashed border-current/30 px-2 text-center text-[10px] leading-tight opacity-70">
          {failed ? "QR no disponible" : payload ? "Generando…" : "QR"}
        </div>
      )}
    </div>
  );
}
