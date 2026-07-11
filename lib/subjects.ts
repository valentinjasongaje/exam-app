/**
 * The fixed subject list: the 4 subjects of the Electronics Engineer (EE)
 * board exam, plus ECT (Electronics Technician) — a separate, distinct
 * exam/certification that happens to mix basic Math and Elex content, but
 * is tracked as its own subject/tile rather than folded into the 4 EE
 * subjects. Kept as a fixed list (not admin-editable) rather than free-text
 * so imports and exam assignment can't fragment into stray subjects — see
 * CONTEXT.md.
 */
export const CANONICAL_SUBJECTS = [
  { name: "Math", slug: "math" },
  { name: "GEAS", slug: "geas" },
  { name: "Elex", slug: "elex" },
  { name: "EST", slug: "est" },
  { name: "ECT", slug: "ect" },
] as const;

export type CanonicalSubjectSlug = (typeof CANONICAL_SUBJECTS)[number]["slug"];
