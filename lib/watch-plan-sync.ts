import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { WATCH_PLAN } from "@/lib/video-library";
import { baseTitle } from "@/lib/video-parts";

/**
 * Brings a user's videos in line with the watch plan (lib/video-library.ts):
 * adds missing plan videos, updates the section/order/title of ones already
 * imported, and removes imported plan videos that are no longer in the plan.
 * Videos the user added by hand (section null) are never touched. Keyed by
 * localPath, so running it twice is harmless and watched progress is kept.
 *
 * Questions are the user's own work and don't depend on which recording they
 * were asked in, so when a video goes away its questions move to the first
 * part of the same lecture in the new plan (their time belonged to the old
 * recording, so it is cleared). A video that has questions but no matching
 * lecture is kept as a hand-added video rather than deleted. Timeline markers
 * are times in one particular recording: they go with it. Notes and formulas
 * belong to the topic, not a video, so they are never affected.
 */
export async function syncWatchPlan(userId: string) {
  const byPath = new Map(WATCH_PLAN.map((v, i) => [v.localPath, { ...v, order: i }]));

  const existing = await prisma.studyVideo.findMany({
    where: { userId, OR: [{ section: { not: null } }, { localPath: { not: null } }] },
    select: { id: true, title: true, subject: true, localPath: true, section: true, order: true, _count: { select: { questions: true } } },
  });
  const have = new Set(existing.map((e) => e.localPath));
  const missing = [...byPath.values()].filter((v) => !have.has(v.localPath));

  await prisma.studyVideo.createMany({
    data: missing.map((v) => ({
      userId,
      subject: v.subject,
      title: v.title,
      section: v.section,
      localPath: v.localPath,
      durationMinutes: v.minutes,
      order: v.order,
    })),
  });

  const stale = existing.filter((e) => e.section && (!e.localPath || !byPath.has(e.localPath)));

  // First part of each lecture in the new plan (new rows included), where a stale video's questions go.
  const firstPart = new Map<string, { id: string; order: number }>();
  if (stale.some((s) => s._count.questions > 0)) {
    const planRows = await prisma.studyVideo.findMany({
      where: { userId, localPath: { in: [...byPath.keys()] } },
      select: { id: true, subject: true, title: true, order: true },
    });
    for (const r of planRows) {
      const key = `${r.subject}|${baseTitle(r.title)}`;
      const cur = firstPart.get(key);
      if (!cur || r.order < cur.order) firstPart.set(key, { id: r.id, order: r.order });
    }
  }

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  const drop: string[] = [];
  let questionsMoved = 0;
  let keptWithQuestions = 0;
  for (const s of stale) {
    const target = s._count.questions > 0 ? firstPart.get(`${s.subject}|${baseTitle(s.title)}`) : undefined;
    if (target) {
      ops.push(prisma.videoQuestion.updateMany({ where: { userId, videoId: s.id }, data: { videoId: target.id, seconds: null } }));
      questionsMoved += s._count.questions;
      drop.push(s.id);
    } else if (s._count.questions > 0) {
      ops.push(prisma.studyVideo.update({ where: { id: s.id }, data: { section: null } }));
      keptWithQuestions++;
    } else {
      drop.push(s.id);
    }
  }
  if (drop.length) ops.push(prisma.studyVideo.deleteMany({ where: { userId, id: { in: drop } } }));

  for (const e of existing) {
    if (!e.localPath || !byPath.has(e.localPath)) continue;
    const p = byPath.get(e.localPath)!;
    if (e.section !== p.section || e.order !== p.order || e.title !== p.title) {
      ops.push(prisma.studyVideo.update({ where: { id: e.id }, data: { section: p.section, order: p.order, title: p.title } }));
    }
  }

  await prisma.$transaction(ops);
  return { added: missing.length, removed: drop.length, questionsMoved, keptWithQuestions };
}
