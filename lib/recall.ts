import { addDays } from "./study-plan";

/**
 * Leitner-style spacing for formula cards. A correct recall moves a card up
 * one box and waits RECALL_INTERVALS[box] days; a miss drops it to box 0 so
 * it stays due today. Box 5 is "known" (checked monthly).
 */
export const RECALL_INTERVALS = [0, 1, 3, 7, 14, 30];
export const MAX_BOX = RECALL_INTERVALS.length - 1;

export function nextRecall(box: number, correct: boolean, today: string) {
  if (!correct) return { box: 0, dueDate: today };
  const next = Math.min(box + 1, MAX_BOX);
  return { box: next, dueDate: addDays(today, RECALL_INTERVALS[next]) };
}

export function isDue(dueDate: string | null, today: string) {
  return dueDate === null || dueDate <= today;
}

export const BOX_LABEL = ["New", "Learning", "Learning", "Getting there", "Almost", "Known"];

/** Symbols that are slow to type on a phone keyboard. */
export const FORMULA_SYMBOLS = [
  "π", "ω", "θ", "φ", "λ", "μ", "ε", "ρ", "σ", "τ", "Δ", "Ω", "α", "β", "γ",
  "√", "²", "³", "⁻¹", "½", "±", "×", "÷", "·", "≈", "≠", "≤", "≥", "∞", "∫", "Σ", "∂", "°", "→",
];
