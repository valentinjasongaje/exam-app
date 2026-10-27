import { Atom, BookOpen, Cpu, Radio, Sigma, Wrench, type LucideIcon } from "lucide-react";
import { clsx } from "clsx";

const ICONS: Record<string, LucideIcon> = {
  math: Sigma,
  geas: Atom,
  elex: Cpu,
  est: Radio,
  ect: Wrench,
};

export function subjectIconFor(slug: string): LucideIcon {
  return ICONS[slug] ?? BookOpen;
}

/** A small tile with an icon for each board-exam subject (Math Σ, GEAS ⚛, Elex chip, EST radio). */
export default function SubjectIcon({ slug, size = "md" }: { slug: string; size?: "sm" | "md" }) {
  const Icon = ICONS[slug] ?? BookOpen;
  return (
    <span
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent",
        size === "sm" ? "h-7 w-7" : "h-10 w-10"
      )}
    >
      <Icon size={size === "sm" ? 15 : 20} />
    </span>
  );
}
