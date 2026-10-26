"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Shrinks its content (by font size, so math stays crisp and keeps its
 * proportions) until it fits the available width, down to `min` of the
 * normal size. Only if it still doesn't fit does it scroll sideways.
 */
export default function FitWidth({ children, min = 0.4, className }: { children: React.ReactNode; min?: number; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const fit = () => {
      i.style.fontSize = "";
      const avail = o.clientWidth - 2;
      // Math doesn't scale perfectly linearly (fixed-width rules, spacing),
      // so refine a few times.
      let scale = 1;
      for (let k = 0; k < 4 && i.scrollWidth > avail && scale > min; k++) {
        scale = Math.max(min, (scale * avail) / i.scrollWidth - 0.01);
        i.style.fontSize = `${scale}em`;
      }
    };
    fit();
    // Math fonts may arrive after the first paint and widen the formula.
    let alive = true;
    document.fonts?.ready.then(() => alive && fit());
    const ro = new ResizeObserver(fit);
    ro.observe(o);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [children, min]);

  return (
    <div ref={outer} className={className} style={{ width: "100%", overflowX: "auto", overflowY: "hidden" }}>
      <span ref={inner} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
        {children}
      </span>
    </div>
  );
}
