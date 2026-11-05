"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crop, X } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui";

type Rect = { x: number; y: number; w: number; h: number }; // display pixels
type Drag =
  | { kind: "new"; ox: number; oy: number }
  | { kind: "move"; dx: number; dy: number }
  | { kind: "resize"; ax: number; ay: number }; // anchor = the opposite corner

const MIN = 12;
const CORNERS = ["nw", "ne", "sw", "se"] as const;

/**
 * Crop a picture before it's attached. Starts with the whole image selected;
 * drag on the picture to draw a new box, drag a corner to resize, drag inside
 * to move. Works with mouse and touch (pointer events).
 */
export function ImageCropper({
  src,
  onDone,
  onClose,
}: {
  src: string;
  onDone: (blob: Blob) => void;
  onClose: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<Drag | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [saving, setSaving] = useState(false);

  // Lock the page behind the dialog; Escape closes.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const size = () => {
    const img = imgRef.current!;
    return { W: img.clientWidth, H: img.clientHeight };
  };
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const point = (e: React.PointerEvent) => {
    const r = imgRef.current!.getBoundingClientRect();
    return { x: clamp(e.clientX - r.left, 0, r.width), y: clamp(e.clientY - r.top, 0, r.height) };
  };
  const fromCorners = (ax: number, ay: number, bx: number, by: number): Rect => ({
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    w: Math.abs(bx - ax),
    h: Math.abs(by - ay),
  });

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!rect) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = point(e);
    const corner = (e.target as HTMLElement).dataset.corner;
    if (corner) {
      const ax = corner.includes("w") ? rect.x + rect.w : rect.x;
      const ay = corner.includes("n") ? rect.y + rect.h : rect.y;
      drag.current = { kind: "resize", ax, ay };
    } else if (p.x > rect.x && p.x < rect.x + rect.w && p.y > rect.y && p.y < rect.y + rect.h) {
      drag.current = { kind: "move", dx: p.x - rect.x, dy: p.y - rect.y };
    } else {
      drag.current = { kind: "new", ox: p.x, oy: p.y };
    }
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || !rect) return;
    const p = point(e);
    const { W, H } = size();
    if (d.kind === "move") {
      setRect({ ...rect, x: clamp(p.x - d.dx, 0, W - rect.w), y: clamp(p.y - d.dy, 0, H - rect.h) });
    } else {
      const ax = d.kind === "new" ? d.ox : d.ax;
      const ay = d.kind === "new" ? d.oy : d.ay;
      const r = fromCorners(ax, ay, p.x, p.y);
      // A tap without dragging keeps the current box.
      if (r.w >= MIN && r.h >= MIN) setRect(r);
    }
  }

  function onUp() {
    drag.current = null;
  }

  async function done() {
    const img = imgRef.current;
    if (!img || !rect) return;
    setSaving(true);
    const kx = img.naturalWidth / img.clientWidth;
    const ky = img.naturalHeight / img.clientHeight;
    const sx = Math.round(rect.x * kx);
    const sy = Math.round(rect.y * ky);
    const sw = Math.max(1, Math.round(rect.w * kx));
    const sh = Math.max(1, Math.round(rect.h * ky));
    const c = document.createElement("canvas");
    c.width = sw;
    c.height = sh;
    c.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.9));
    setSaving(false);
    if (blob) onDone(blob);
  }

  const whole = () => {
    const { W, H } = size();
    setRect({ x: 0, y: 0, w: W, h: H });
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Crop picture">
      <div className="animate-pop-in flex max-h-full w-full max-w-4xl flex-col gap-3 rounded-2xl bg-bg-elevated p-3 shadow-xl sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <Crop size={17} className="text-accent" /> Crop picture
          </h2>
          <button type="button" onClick={onClose} aria-label="Cancel" className="rounded-lg p-1.5 text-ink-muted hover:bg-bg-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-ink-muted">Drag across the picture to pick the part you want. Drag the corners to adjust, or inside the box to move it.</p>

        <div className="flex min-h-0 justify-center overflow-hidden">
          <div
            className="relative touch-none select-none"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              crossOrigin={src.startsWith("data:") || src.startsWith("blob:") ? undefined : "anonymous"}
              onLoad={whole}
              className="block max-h-[65vh] max-w-full cursor-crosshair"
            />
            {rect && (
              <div
                className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
              >
                {CORNERS.map((c) => (
                  <span
                    key={c}
                    data-corner={c}
                    className={clsx(
                      "absolute h-4 w-4 rounded-sm border-2 border-white bg-accent before:absolute before:-inset-3 before:content-['']", // bigger touch target
                      c.includes("n") ? "-top-2" : "-bottom-2",
                      c.includes("w") ? "-left-2 cursor-nwse-resize" : "-right-2 cursor-nesw-resize",
                      (c === "nw" || c === "se") && "cursor-nwse-resize",
                      (c === "ne" || c === "sw") && "cursor-nesw-resize"
                    )}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={whole} className="mr-auto text-sm text-ink-muted hover:text-ink">
            Select all
          </button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={done} disabled={!rect || saving}>
            {saving ? "Cropping…" : "Use this part"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
