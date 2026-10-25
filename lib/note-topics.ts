import { prisma } from "@/lib/prisma";
import { TRACKER_SUBJECTS } from "@/lib/study-plan";
import { WATCH_PLAN } from "@/lib/video-library";

/** Topic suggestions for the note editor: review-lecture topics + the user's topic checklist. */
export async function topicSuggestions(userId: string) {
  const topics = await prisma.studyTopic.findMany({ where: { userId }, select: { subject: true, name: true } });
  const out: Record<string, string[]> = {};
  for (const s of TRACKER_SUBJECTS) {
    const fromPlan = WATCH_PLAN.filter((v) => v.section === "core" && v.subject === s.slug).map((v) =>
      v.title.replace(/^\S+ \d+ · /, "")
    );
    const fromChecklist = topics.filter((t) => t.subject === s.slug).map((t) => t.name);
    out[s.slug] = [...new Set([...fromPlan, ...fromChecklist])];
  }
  return out;
}
