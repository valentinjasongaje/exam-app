import { Clock } from "lucide-react";
import { clsx } from "clsx";

export function ExamTimer({ label, expired }: { label: string; expired: boolean }) {
  return (
    <div
      className={clsx(
        "mb-6 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium",
        expired ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent"
      )}
    >
      <Clock size={16} />
      {expired ? "Time's up — answering is locked. Tap Submit to finish." : `Time remaining: ${label}`}
    </div>
  );
}
