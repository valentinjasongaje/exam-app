import { prisma } from "@/lib/prisma";
import { DEFAULT_TOPICS, TRACKER_SUBJECTS } from "@/lib/study-plan";

/**
 * Seeds the default ECE topic checklist the first time a user opens the
 * tracker. Kept out of app/tracker/actions.ts on purpose: anything exported
 * from a "use server" file is callable from the browser, and this takes a
 * userId argument.
 */
export async function ensureDefaultTopics(userId: string) {
  const count = await prisma.studyTopic.count({ where: { userId } });
  if (count > 0) return;
  await prisma.studyTopic.createMany({
    data: TRACKER_SUBJECTS.flatMap((s) =>
      DEFAULT_TOPICS[s.slug].map((name, i) => ({ userId, subject: s.slug, name, order: i }))
    ),
  });
}
