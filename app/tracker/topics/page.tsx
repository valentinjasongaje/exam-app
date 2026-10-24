import { X } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureDefaultTopics } from "@/lib/study-topics";
import { TRACKER_SUBJECTS } from "@/lib/study-plan";
import { PageHeader, Card } from "@/components/ui";
import ProgressBar from "../progress-bar";
import StatusSelect from "./status-select";
import { AddTopicForm } from "../add-item-form";
import { deleteTopicAction } from "../actions";

export default async function TopicsPage() {
  const session = await auth();
  const userId = session!.user.id;
  await ensureDefaultTopics(userId);

  const topics = await prisma.studyTopic.findMany({
    where: { userId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  const doneAll = topics.filter((t) => t.status === "DONE").length;

  return (
    <>
      <PageHeader
        eyebrow="Study tracker"
        title="Topic checklist"
        subtitle={`${doneAll} of ${topics.length} topics done. Mark a topic "Needs review" when a quiz shows it's weak.`}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {TRACKER_SUBJECTS.map((s) => {
          const mine = topics.filter((t) => t.subject === s.slug);
          const done = mine.filter((t) => t.status === "DONE").length;
          return (
            <Card key={s.slug}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="font-semibold">{s.name}</h2>
                <span className="text-sm tabular-nums text-ink-muted">
                  {done}/{mine.length}
                </span>
              </div>
              <ProgressBar value={done} max={mine.length} tone="success" className="mb-4" />
              <ul className="flex flex-col">
                {mine.map((t) => (
                  <li
                    key={t.id}
                    className="group flex items-center gap-2 border-b border-border py-2 text-sm last:border-0"
                  >
                    <span
                      className={
                        "min-w-0 flex-1 " + (t.status === "DONE" ? "text-ink-muted line-through" : "")
                      }
                    >
                      {t.name}
                    </span>
                    <StatusSelect key={`${t.id}-${t.status}`} id={t.id} status={t.status} />
                    <form action={deleteTopicAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        type="submit"
                        aria-label={`Remove ${t.name}`}
                        className="rounded-md p-1 text-ink-faint opacity-60 transition hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
                      >
                        <X size={14} />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
              <AddTopicForm subject={s} />
            </Card>
          );
        })}
      </div>
    </>
  );
}
