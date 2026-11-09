/**
 * Reads a review-center "exam review" page saved by Chrome as .mhtml
 * (my.excelreviewer.com/exam/review/<id>) into questions, in the browser.
 *
 * These pages list each item with its question, the correct answer, the
 * answer the reviewee gave (green when right) and an optional solution
 * (usually a picture). They do NOT contain the original A–D choices, so the
 * importer rebuilds them: correct answer + the reviewee's wrong pick (a real
 * choice from the original) + AI-written wrong choices for the rest.
 *
 * Browser-only (DOMParser, TextDecoder); pure parsing, no network.
 */

export type ReviewQuestion = {
  order: number;
  sourceItemId: string;
  text: string;
  /** data: URL of the question's picture, if any. */
  image: string | null;
  correct: string;
  /** The reviewee's answer when it was wrong: a genuine wrong choice from the original question. */
  wrongPick: string | null;
  explanation: string | null;
  /** data: URLs of the solution pictures (usually one; joined into one before upload). */
  solutionImages: string[];
};

export type ReviewExam = {
  fileName: string;
  title: string;
  /** Canonical subject slug (math/geas/elex/est), or "" if it couldn't be told. */
  subject: string;
  /** The page's own subject label, e.g. "RC-Math", "ECE PB - Elec". */
  sourceSubject: string;
  isBoardExam: boolean;
  questions: ReviewQuestion[];
  /** Items that can't be rebuilt without the original choices ("All of the choices"…). */
  unusable: { order: number; sourceItemId: string; text: string; correct: string; reason: string }[];
};

// ---------- MHTML (MIME) unpacking ----------

/** Bytes → "binary string" (one char per byte), in chunks to avoid call-stack limits. */
function binaryString(bytes: Uint8Array) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
}

function decodeQuotedPrintable(body: string): Uint8Array {
  const s = body.replace(/=\r?\n/g, ""); // soft line breaks
  const out = new Uint8Array(s.length);
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch === 61 /* = */ && i + 2 < s.length + 1) {
      const hex = s.substr(i + 1, 2);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        out[n++] = parseInt(hex, 16);
        i += 2;
        continue;
      }
    }
    out[n++] = ch & 0xff;
  }
  return out.subarray(0, n);
}

/** The saved page's HTML from an .mhtml file. */
export function htmlFromMhtml(buffer: ArrayBuffer): string {
  const raw = binaryString(new Uint8Array(buffer));
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(raw)?.[1];
  if (!boundary) throw new Error("Not an MHTML file (no MIME boundary).");
  const parts = raw.split("--" + boundary);
  for (const part of parts) {
    const split = part.search(/\r?\n\r?\n/);
    if (split < 0) continue;
    const head = part.slice(0, split);
    if (!/content-type:\s*text\/html/i.test(head)) continue;
    const body = part.slice(split).replace(/^\r?\n\r?\n/, "");
    const enc = /content-transfer-encoding:\s*([\w-]+)/i.exec(head)?.[1]?.toLowerCase();
    const bytes =
      enc === "quoted-printable"
        ? decodeQuotedPrintable(body)
        : enc === "base64"
          ? Uint8Array.from(atob(body.replace(/\s+/g, "")), (c) => c.charCodeAt(0))
          : Uint8Array.from(body, (c) => c.charCodeAt(0) & 0xff);
    const charset = /charset="?([\w-]+)/i.exec(head)?.[1] ?? "utf-8";
    return new TextDecoder(charset).decode(bytes);
  }
  throw new Error("No web page found inside this MHTML file.");
}

// ---------- page parsing ----------

/** Same small source quirks the HTML importer fixes (lib/exam-parser.js). */
function tidyText(t: string) {
  return t.replace(/ˉ(?=[¹²³⁰-⁹])/g, "⁻").replace(/([A-Za-z])`([A-Za-z])/g, "$1’$2");
}

/** Visible text of an element, with line breaks for <br>/<p>/<div>, without pictures. */
function textOf(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("img, script, style").forEach((n) => n.remove());
  // Line breaks inside the page's source are just spaces when shown; only <br>/<p>/<div> break lines.
  const walker = clone.ownerDocument.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) n.nodeValue = (n.nodeValue ?? "").replace(/\s+/g, " ");
  clone.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
  clone.querySelectorAll("p, div, li, tr").forEach((n) => n.append("\n"));
  const t = (clone.textContent ?? "")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return tidyText(t);
}

const imgs = (el: Element | null) =>
  el ? [...el.querySelectorAll("img")].map((i) => i.getAttribute("src") ?? "").filter((s) => s.startsWith("data:image/")) : [];

/** "RC-Math", "ECE PB - Elec", "HB GEAS" … or, failing that, the file name → canonical subject. */
export function subjectFrom(label: string, fileName: string) {
  const pick = (s: string) =>
    /\bmath\b/i.test(s) ? "math" : /\bgeas\b|\besas\b/i.test(s) ? "geas" : /\belec\b|\belex\b/i.test(s) ? "elex" : /\best\b/i.test(s) ? "est" : "";
  return pick(label) || pick(fileName.replace(/[-_]/g, " "));
}

/** "Review Exam - GEAS 09(2).mhtml" → "Review Exam - GEAS 09 (2)". */
export function titleFrom(fileName: string) {
  return fileName
    .replace(/\.mhtml?$/i, "")
    .replace(/(\S)\((\d+)\)$/, "$1 ($2)")
    .replace(/\s+/g, " ")
    .trim();
}

const NEEDS_ORIGINAL = /\b(all|none|both)\b[^.]*\b(choices|above|options|of these)\b|^\s*[a-d]\s*(and|&)\s*[a-d]\b|\b[a-d] only\b/i;

/** Parses one saved review page. Throws with a readable message if it isn't one. */
export function parseReviewPage(html: string, fileName: string): ReviewExam {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = [...doc.querySelectorAll("#tblreview tbody tr[data-id]")];
  if (rows.length === 0) throw new Error("No review table found (expected an “Exam Review” page).");

  const meta: Record<string, string> = {};
  doc.querySelectorAll("#page-content table.table tr").forEach((tr) => {
    const tds = tr.querySelectorAll("td");
    if (tds.length === 2) meta[(tds[0].textContent ?? "").trim().replace(/:$/, "")] = (tds[1].textContent ?? "").trim();
  });
  const sourceSubject = meta["Subject"] ?? "";

  const questions: ReviewQuestion[] = [];
  const unusable: ReviewExam["unusable"] = [];
  rows.forEach((tr, i) => {
    const tds = tr.querySelectorAll(":scope > td");
    if (tds.length < 4) return;
    const sourceItemId = tr.getAttribute("data-id")!;
    const order = Number((tds[0].textContent ?? "").trim()) || i + 1;

    const qCell = tds[1].cloneNode(true) as Element;
    const sol = qCell.querySelector("div.collapse");
    const solutionImages = imgs(sol);
    const explanation = sol
      ? textOf(sol)
          .split("\n")
          .filter((l) => l.trim().toLowerCase() !== "solution:")
          .join("\n")
          .replace(/^solution:\s*/i, "")
          .trim() || null
      : null;
    sol?.remove();
    const image = imgs(qCell)[0] ?? null;
    const text = textOf(qCell);
    const correct = textOf(tds[2]);
    const right = !!tds[3].querySelector(".text-green");
    const yours = textOf(tds[3]);
    const wrongPick = !right && yours && yours.toLowerCase() !== correct.toLowerCase() ? yours : null;

    if (!correct) {
      unusable.push({ order, sourceItemId, text, correct, reason: "No correct answer on the page" });
      return;
    }
    if (NEEDS_ORIGINAL.test(correct)) {
      unusable.push({ order, sourceItemId, text, correct, reason: "The answer refers to the original choices" });
      return;
    }
    questions.push({ order, sourceItemId, text, image, correct, wrongPick, explanation, solutionImages });
  });

  return {
    fileName,
    title: titleFrom(fileName),
    subject: subjectFrom(sourceSubject, fileName),
    sourceSubject,
    isBoardExam: rows.length >= 100,
    questions,
    unusable,
  };
}

/** Stacks several solution pictures into one PNG data URL (the app keeps one solution picture). */
export async function joinImages(dataUrls: string[]): Promise<string | null> {
  if (dataUrls.length === 0) return null;
  if (dataUrls.length === 1) return dataUrls[0];
  const bitmaps = await Promise.all(dataUrls.map(async (u) => createImageBitmap(await (await fetch(u)).blob())));
  const width = Math.max(...bitmaps.map((b) => b.width));
  const height = bitmaps.reduce((h, b) => h + b.height, 0);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  let y = 0;
  for (const b of bitmaps) {
    ctx.drawImage(b, 0, y);
    y += b.height;
  }
  return c.toDataURL("image/png");
}
