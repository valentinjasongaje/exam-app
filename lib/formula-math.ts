import AsciiMathParser from "asciimath2tex";

/**
 * Turns a formula typed the quick way (calculator-style, with the symbol
 * bar's Unicode) into LaTeX for KaTeX to draw:
 *
 *   x/y, 1/(2πfC)        → stacked fractions; everything written together
 *                          (no space) on each side of / goes on that side:
 *                          R1R2/(R1+R2), Vp/√2, 1/2πf
 *   X2, R1, V12, x_2     → subscripts (a lone letter followed by digits)
 *   Xc, Vp, Vrms, Rth    → X_c, V_p, V_rms (capital + lowercase tail, the usual
 *                          engineering naming; XL or RC stay as written,
 *                          type X_L for a capital subscript)
 *   ², ³, ⁻¹, x^2        → powers
 *   √(...)               → a root over the right part (see `expandRoots`)
 *   π ω θ Δ Ω …          → Greek letters
 *   $...$                → raw LaTeX, for anything the shortcuts can't express
 *
 * Pure function, used on the server and in the browser preview.
 */

const parser = new AsciiMathParser();

const GREEK: Record<string, string> = {
  π: "pi", ω: "omega", θ: "theta", φ: "phi", λ: "lambda", μ: "mu", ε: "epsilon", ρ: "rho",
  σ: "sigma", τ: "tau", α: "alpha", β: "beta", γ: "gamma", δ: "delta", η: "eta",
  Δ: "Delta", Ω: "Omega", Σ: "sum", Φ: "Phi", Θ: "Theta", Λ: "Lambda", Π: "prod",
};

const SYMBOLS: [RegExp, string][] = [
  [/−|–/g, "-"],
  [/×/g, " xx "],
  [/·/g, " * "],
  [/÷/g, " -: "],
  [/≤/g, " <= "],
  [/≥/g, " >= "],
  [/≠/g, " != "],
  [/≈/g, " ~~ "],
  [/±/g, " +- "],
  [/∞/g, " oo "],
  [/→/g, " -> "],
  [/∫/g, " int "],
  [/∂/g, " del "],
  [/°/g, "^@"],
  [/½/g, "(1/2)"],
  [/⁻¹/g, "^(-1)"],
  [/²/g, "^2"],
  [/³/g, "^3"],
];

const LETTER = "A-Za-zα-ωΑ-Ω";

/** X2 → X_2, R12 → R_12; leaves sin2x, log10, 2πf alone (letter must not follow another letter). */
function autoSubscripts(s: string) {
  return s.replace(new RegExp(`(?<![${LETTER}_\\\\])([${LETTER}])(\\d+)(?![\\d.])`, "gu"), "$1_$2");
}

/**
 * Decides how far a √ reaches, the way people mean it when typing:
 *  - √(…) followed by ², ^, + or - : the root covers everything to the end of
 *    that side (until "=", "," or a closing bracket), e.g. √(x2-x1)²+(y2-y1)²
 *  - √(…) otherwise: just the bracket, e.g. 1/(2π√(LC))
 *  - √x or √2: just that term (with its power, if any)
 * Rewrites each into sqrt(...) with explicit brackets.
 */
function expandRoots(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch !== "√") {
      out += ch;
      i++;
      continue;
    }
    let j = i + 1;
    while (s[j] === " ") j++;
    let inner: string;
    let end: number;
    if (s[j] === "(") {
      const close = matchBracket(s, j);
      const after = s.slice(close + 1).trimStart()[0];
      if (after && "²³^+-−".includes(after)) {
        end = sideEnd(s, j);
        inner = s.slice(j, end);
      } else {
        end = close + 1;
        inner = s.slice(j + 1, close);
      }
    } else {
      const m = s.slice(j).match(new RegExp(`^[${LETTER}0-9._]+(?:\\^\\S|[²³])?`, "u"));
      end = j + (m ? m[0].length : 0);
      inner = s.slice(j, end);
    }
    out += `sqrt(${expandRoots(inner)})`;
    i = end;
  }
  return out;
}

function matchBracket(s: string, open: number) {
  let depth = 0;
  for (let k = open; k < s.length; k++) {
    if (s[k] === "(") depth++;
    else if (s[k] === ")" && --depth === 0) return k;
  }
  return s.length - 1;
}

/** End of the current side: stops at "=", "," or an unmatched closing bracket. */
function sideEnd(s: string, from: number) {
  let depth = 0;
  for (let k = from; k < s.length; k++) {
    const c = s[k];
    if (c === "(") depth++;
    else if (c === ")") {
      if (depth === 0) return k;
      depth--;
    } else if (depth === 0 && (c === "=" || c === "," || c === "<" || c === ">")) return k;
  }
  return s.length;
}

const CHAIN = new RegExp(`[${LETTER}0-9_.²³⁻¹]`, "u");

/** Start index of the run of juxtaposed terms that ends just before `end`. */
function chainStart(s: string, end: number) {
  let k = end;
  while (k > 0) {
    const c = s[k - 1];
    if (c === ")") {
      let depth = 0;
      let m = k - 1;
      for (; m >= 0; m--) {
        if (s[m] === ")") depth++;
        else if (s[m] === "(" && --depth === 0) break;
      }
      k = Math.max(0, m);
    } else if (CHAIN.test(c)) k--;
    else break;
  }
  return k;
}

/** End index (exclusive) of the run of juxtaposed terms that starts at `start`. */
function chainEnd(s: string, start: number) {
  let k = start;
  while (k < s.length) {
    const c = s[k];
    if (c === "(") k = matchBracket(s, k) + 1;
    else if (CHAIN.test(c)) k++;
    else break;
  }
  return k;
}

/** Wraps multi-term numerators/denominators in brackets so the fraction takes all of them. */
function groupFractions(s: string) {
  let out = s;
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== "/") continue;
    const ls = chainStart(out, i);
    const re = chainEnd(out, i + 1);
    const left = out.slice(ls, i);
    const right = out.slice(i + 1, re);
    const wrap = (t: string) => (/^\(.*\)$/.test(t) && matchBracket(t, 0) === t.length - 1) || /^[^()]$/.test(t) ? t : `(${t})`;
    const replacement = `${left ? wrap(left) : ""}/${right ? wrap(right) : ""}`;
    out = out.slice(0, ls) + replacement + out.slice(re);
    i = ls + replacement.indexOf("/", left ? wrap(left).length : 0);
  }
  return out;
}

const FUNCTIONS = new Set([
  "sin", "cos", "tan", "sec", "csc", "cot", "sinh", "cosh", "tanh", "arcsin", "arccos", "arctan",
  "log", "ln", "exp", "lim", "max", "min", "det", "mod", "gcd", "lcm", "sqrt", "int", "sum", "prod",
]);

/**
 * Letter runs: keep function names; Capital+lowercase → subscripted name
 * (Vrms → V_(rms)); any other run (RC, ac, fC) becomes one spaced group so a
 * fraction takes the whole run and two-letter AsciiMath keywords (fr, bb, cc…)
 * can't trigger by accident.
 */
function letterRuns(s: string) {
  return s.replace(/(?<![A-Za-z])[A-Za-z]{2,}(?![A-Za-z])/g, (run, offset: number, all: string) => {
    if (FUNCTIONS.has(run.toLowerCase())) return run;
    // "sinx", "cosθ" written together: function name + its argument.
    const fn = [...FUNCTIONS].find((f) => f.length >= 2 && run.toLowerCase().startsWith(f) && run.length > f.length);
    if (fn && fn !== "sqrt") return `${run.slice(0, fn.length)} ${run.slice(fn.length).split("").join(" ")}`;
    const afterUnderscore = all[offset - 1] === "_";
    if (!afterUnderscore && /^[A-Z][a-z]+$/.test(run)) return `${run[0]}_(${run.slice(1).split("").join(" ")})`;
    return `{:${run.split("").join(" ")}:}`;
  });
}

export function formulaToTex(input: string): string {
  const text = input.trim();
  if (!text) return "";
  const raw = text.match(/^\$([\s\S]+)\$$/);
  if (raw) return raw[1];

  let s = autoSubscripts(text);
  s = expandRoots(s);
  s = groupFractions(s);
  s = letterRuns(s);
  for (const [re, rep] of SYMBOLS) s = s.replace(re, rep);
  s = s.replace(/[α-ωΑ-Ω]/gu, (g) => (GREEK[g] ? ` ${GREEK[g]} ` : g));
  return tidy(parser.parse(s));
}

/** Cleans AsciiMath's output: invisible group brackets, and f/g read as functions (2πfC). */
function tidy(tex: string) {
  let t = tex.replace(/\\left \.\s?|\s?\\right \./g, "");
  // AsciiMath treats f and g as function names: f{C} → f C. Repeat for nesting.
  for (let k = 0; k < 5; k++) {
    const next = t.replace(/(^|[^\\A-Za-z])([fg])\{([^{}]*)\}/g, "$1$2 $3");
    if (next === t) break;
    t = next;
  }
  return t.replace(/\s+/g, " ").trim();
}
