import { prisma } from "@/lib/prisma";
import { WATCH_PLAN } from "@/lib/video-library";

/**
 * The admin's Google Drive is the shared video library: the admin uploads,
 * and every signed-in account streams those same files. Each account keeps
 * its own StudyVideo rows (watched progress, notes, questions), matched to
 * the admin's uploads by the plan video's localPath.
 */

/** The account whose Drive holds the videos (the first admin). */
export async function adminUserId() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  return admin?.id ?? null;
}

/** localPath → Drive file id of every plan video the admin has uploaded. */
export async function sharedDriveFiles() {
  const adminId = await adminUserId();
  if (!adminId) return new Map<string, string>();
  const rows = await prisma.studyVideo.findMany({
    where: { userId: adminId, localPath: { not: null }, driveFileId: { not: null } },
    select: { localPath: true, driveFileId: true },
  });
  return new Map(rows.map((r) => [r.localPath!, r.driveFileId!]));
}

/** Drive file to play for this user's video row: their own upload (admin) or the shared one. */
export async function playableFileId(video: { localPath: string | null; driveFileId: string | null }, isAdmin: boolean) {
  if (isAdmin && video.driveFileId) return video.driveFileId;
  if (!video.localPath) return null;
  return (await sharedDriveFiles()).get(video.localPath) ?? null;
}

/**
 * Makes sure the user has a StudyVideo row for every plan video, so each one
 * has an id to open at /watch/<id> and to track progress against.
 */
export async function ensurePlanVideos(userId: string) {
  const have = new Set(
    (await prisma.studyVideo.findMany({ where: { userId, localPath: { not: null } }, select: { localPath: true } })).map((v) => v.localPath)
  );
  const missing = WATCH_PLAN.map((p, order) => ({ p, order })).filter(({ p }) => !have.has(p.localPath));
  if (missing.length === 0) return;
  await prisma.studyVideo.createMany({
    data: missing.map(({ p, order }) => ({
      userId,
      subject: p.subject,
      title: p.title,
      section: p.section,
      localPath: p.localPath,
      durationMinutes: p.minutes,
      order,
    })),
  });
}
