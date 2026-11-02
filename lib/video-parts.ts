/**
 * A lecture can be recorded in several parts and in several versions, and each
 * file is its own plan video. Titles carry that after an em dash:
 *
 *   "Math 01 · Differential Calculus 1 — Part 3"
 *   "Elec 01 · DC Electrical Circuits — V2 · Part 5"
 *
 * Everything before the dash is the lecture ("base title"); notes, formulas,
 * questions and markers belong to the lecture, so every part and version of it
 * shows the same ones. Pure string helpers: safe on the server and the client.
 */

const SEP = " — ";

/** "Math 01 · Differential Calculus 1 — Part 3" → "Math 01 · Differential Calculus 1". */
export function baseTitle(title: string) {
  const i = title.indexOf(SEP);
  return i < 0 ? title : title.slice(0, i);
}

/** "Math 01 · Differential Calculus 1 — V2 · Part 3" → "V2 · Part 3" (null for a video that isn't in parts). */
export function partLabel(title: string) {
  const i = title.indexOf(SEP);
  return i < 0 ? null : title.slice(i + SEP.length);
}

/** The topic a note is filed under: "Math 01 · Differential Calculus 1 — Part 3" → "Differential Calculus 1". */
export function videoTopic(title: string) {
  return baseTitle(title).replace(/^\S+ \d+ · /, "");
}

/** Prisma `where` for every video of the same lecture as `title` (the lecture itself, or any "— …" part of it). */
export function sameLecture(title: string) {
  const base = baseTitle(title);
  return { OR: [{ title: base }, { title: { startsWith: base + SEP } }] };
}
