"use client";

import { useEffect, useRef, useState } from "react";
import { Square, Paintbrush, Pipette, Undo2, X } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui";

type Mode = "rect" | "brush" | "eyedropper";

const MAX_HISTORY = 15;

export function ImageEditor({
  src,
  onSave,
  onClose,
}: {
  src: string;
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<ImageData[]>([]);
  const snapshotRef = useRef<ImageData | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const drawingRef = useRef(false);

  const [mode, setMode] = useState<Mode>("rect");
  const [priorMode, setPriorMode] = useState<Mode>("rect");
  const [color, setColor] = useState("#ffffff");
  const [brushSize, setBrushSize] = useState(24);
  const [canUndo, setCanUndo] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    // Remote images (Vercel Blob) need CORS opt-in or toDataURL() throws
    // on the tainted canvas; data: URLs must not set it.
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      historyRef.current = [];
      setCanUndo(false);
      setLoaded(true);
    };
    img.src = src;
  }, [src]);

  function getPoint(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function sampleColorAt(point: { x: number; y: number }) {
    const ctx = canvasRef.current!.getContext("2d")!;
    const [r, g, b] = ctx.getImageData(point.x, point.y, 1, 1).data;
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }

  function pushHistory() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    setCanUndo(true);
  }

  function handleDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const point = getPoint(e);

    if (mode === "eyedropper") {
      setColor(sampleColorAt(point));
      setMode(priorMode);
      return;
    }

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    drawingRef.current = true;

    if (mode === "rect") {
      startPointRef.current = point;
    } else {
      lastPointRef.current = point;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function handleMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const point = getPoint(e);

    if (mode === "rect") {
      ctx.putImageData(snapshotRef.current!, 0, 0);
      const start = startPointRef.current!;
      ctx.fillStyle = color;
      ctx.fillRect(
        Math.min(start.x, point.x),
        Math.min(start.y, point.y),
        Math.abs(point.x - start.x),
        Math.abs(point.y - start.y)
      );
    } else {
      const last = lastPointRef.current!;
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      lastPointRef.current = point;
    }
  }

  function handleUp() {
    if (drawingRef.current) pushHistory();
    drawingRef.current = false;
  }

  function undo() {
    const prev = historyRef.current.pop();
    if (!prev) return;
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.putImageData(prev, 0, 0);
    setCanUndo(historyRef.current.length > 0);
  }

  function enterEyedropper() {
    setPriorMode(mode === "eyedropper" ? priorMode : mode);
    setMode("eyedropper");
  }

  function handleSave() {
    onSave(canvasRef.current!.toDataURL("image/png"));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-xl bg-bg-elevated p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <div className="flex items-center gap-1 rounded-lg border border-border-strong p-1">
            <button
              type="button"
              onClick={() => setMode("rect")}
              className={clsx(
                "flex h-7 w-7 items-center justify-center rounded-md",
                mode === "rect" ? "bg-accent-soft text-accent" : "text-ink-muted hover:text-ink"
              )}
              title="Rectangle patch"
            >
              <Square size={15} />
            </button>
            <button
              type="button"
              onClick={() => setMode("brush")}
              className={clsx(
                "flex h-7 w-7 items-center justify-center rounded-md",
                mode === "brush" ? "bg-accent-soft text-accent" : "text-ink-muted hover:text-ink"
              )}
              title="Freehand brush"
            >
              <Paintbrush size={15} />
            </button>
            <button
              type="button"
              onClick={enterEyedropper}
              className={clsx(
                "flex h-7 w-7 items-center justify-center rounded-md",
                mode === "eyedropper" ? "bg-accent-soft text-accent" : "text-ink-muted hover:text-ink"
              )}
              title="Pick a color from the image"
            >
              <Pipette size={15} />
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-ink-muted">
            Color
            <input
              type="color"
              value={color}
              onChange={(ev) => setColor(ev.target.value)}
              className="h-7 w-9 cursor-pointer rounded border border-border-strong"
            />
          </label>

          {mode === "brush" && (
            <label className="flex items-center gap-1.5 text-ink-muted">
              Brush size
              <input
                type="range"
                min={4}
                max={80}
                value={brushSize}
                onChange={(ev) => setBrushSize(Number(ev.target.value))}
              />
            </label>
          )}

          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="flex items-center gap-1 text-ink-muted hover:text-ink disabled:opacity-40"
          >
            <Undo2 size={15} />
            Undo
          </button>

          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-bg-muted hover:text-ink"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <p className="mb-3 text-xs text-ink-muted">
          Draw a rectangle over a watermark to patch it, or use the eyedropper to match the
          surrounding color first.
        </p>

        <div className="overflow-auto rounded-lg border border-border bg-bg-muted">
          {!loaded && <p className="p-6 text-center text-sm text-ink-muted">Loading…</p>}
          <canvas
            ref={canvasRef}
            className={clsx("max-w-full", !loaded && "hidden", mode === "eyedropper" ? "cursor-crosshair" : "cursor-crosshair")}
            onMouseDown={handleDown}
            onMouseMove={handleMove}
            onMouseUp={handleUp}
            onMouseLeave={handleUp}
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save edit</Button>
        </div>
      </div>
    </div>
  );
}
