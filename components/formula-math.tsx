import katex from "katex";
import "katex/dist/katex.min.css";
import { clsx } from "clsx";
import { formulaToTex } from "@/lib/formula-math";

/**
 * Draws a formula card's text as real math (stacked fractions, subscripts,
 * roots that stretch over what they cover). Works in server and client
 * components; anything that can't be drawn falls back to the typed text.
 */
export default function FormulaMath({ formula, className, display }: { formula: string; className?: string; display?: boolean }) {
  let html: string | null = null;
  try {
    html = katex.renderToString(`\\displaystyle ${formulaToTex(formula)}`, { throwOnError: true, displayMode: !!display, output: "html", strict: "ignore" });
  } catch {
    html = null;
  }
  if (!html) return <span className={clsx("font-mono break-words", className)}>{formula}</span>;
  return (
    <span
      className={clsx("formula-math inline-block max-w-full overflow-x-auto overflow-y-hidden align-middle", className)}
      title={formula}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Small "looks like" line under a formula input while typing. */
export function FormulaPreview({ formula }: { formula: string }) {
  if (!formula.trim()) return null;
  return (
    <span className="flex min-w-0 items-center gap-2 rounded-md bg-bg-muted/60 px-2 py-1 text-ink">
      <span className="shrink-0 text-[10px] font-medium tracking-wide text-ink-faint uppercase">Shows as</span>
      <FormulaMath formula={formula} className="text-base" />
    </span>
  );
}
