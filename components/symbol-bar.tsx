"use client";

import { FORMULA_SYMBOLS } from "@/lib/recall";

type Field = HTMLInputElement | HTMLTextAreaElement;

/** Types text into a field at the caret, going through React's onChange. */
export function typeInto(el: Field, text: string) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const value = el.value.slice(0, start) + text + el.value.slice(end);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + text.length, start + text.length);
  });
}

/**
 * Buttons for symbols that are slow to type on a phone (π, √, ², Ω…).
 * Inserts into `target` (the field last focused), keeping that field focused.
 */
export default function SymbolBar({ target, hint }: { target: React.RefObject<Field | null>; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-1">
      <div className="flex flex-wrap gap-0.5">
        {FORMULA_SYMBOLS.map((s) => (
          <button
            key={s}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => target.current && typeInto(target.current, s)}
            className="min-w-7 rounded px-1 py-0.5 font-mono text-xs text-ink-muted hover:bg-bg-muted hover:text-ink"
          >
            {s}
          </button>
        ))}
      </div>
      {hint && <p className="px-1 pt-0.5 text-[10px] text-ink-faint">{hint}</p>}
    </div>
  );
}
