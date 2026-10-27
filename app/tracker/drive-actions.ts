"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DriveError, accessTokenFor, deleteFile, listUploads, revoke } from "@/lib/google-drive";
import { WATCH_PLAN } from "@/lib/video-library";

export type DriveActionResult = { error: string | null; message?: string };

async function requireUserId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

function refresh() {
  revalidatePath("/tracker", "layout");
  revalidatePath("/lessons", "layout");
  revalidatePath("/settings");
}

function fail(e: unknown): DriveActionResult {
  return { error: e instanceof DriveError || e instanceof Error ? e.message : "Something went wrong with Drive." };
}

/** Removes one video's Drive copy (permanent delete, frees the space now). Local file and progress are untouched. */
export async function removeFromDriveAction(videoId: string): Promise<DriveActionResult> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not logged in." };
  const video = await prisma.studyVideo.findFirst({ where: { id: videoId, userId } });
  if (!video?.driveFileId) return { error: null };
  try {
    const { token } = await accessTokenFor(userId);
    try {
      await deleteFile(token, video.driveFileId);
    } catch (e) {
      if (!(e instanceof DriveError) || e.status !== 404) throw e; // already gone is fine
    }
    await prisma.studyVideo.update({ where: { id: video.id }, data: { driveFileId: null, driveUploadedAt: null } });
    refresh();
    return { error: null };
  } catch (e) {
    return fail(e);
  }
}

/** Frees Drive space by removing every uploaded video already marked watched. */
export async function removeWatchedFromDriveAction(): Promise<DriveActionResult> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not logged in." };
  const videos = await prisma.studyVideo.findMany({ where: { userId, driveFileId: { not: null } } });
  const watched = videos.filter((v) => v.watchedMinutes >= v.durationMinutes);
  if (watched.length === 0) return { error: null, message: "No watched videos on Drive." };
  try {
    const { token } = await accessTokenFor(userId);
    for (const v of watched) {
      try {
        await deleteFile(token, v.driveFileId!);
      } catch (e) {
        if (!(e instanceof DriveError) || e.status !== 404) throw e;
      }
      await prisma.studyVideo.update({ where: { id: v.id }, data: { driveFileId: null, driveUploadedAt: null } });
    }
    refresh();
    return { error: null, message: `Removed ${watched.length} watched video${watched.length > 1 ? "s" : ""} from Drive.` };
  } catch (e) {
    refresh();
    return fail(e);
  }
}

/**
 * Re-checks Drive against the app: links uploads that finished but weren't
 * recorded (tab closed at the last second), and clears links to files that
 * were deleted in Drive directly.
 */
export async function syncDriveAction(): Promise<DriveActionResult> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not logged in." };
  try {
    const { token, conn } = await accessTokenFor(userId);
    const files = conn.folderId ? await listUploads(token, conn.folderId) : [];
    const byPath = new Map(files.filter((f) => f.appProperties?.planPath).map((f) => [f.appProperties!.planPath, f]));
    const videos = await prisma.studyVideo.findMany({ where: { userId } });
    const byLocal = new Map(videos.filter((v) => v.localPath).map((v) => [v.localPath!, v]));
    let linked = 0;
    let cleared = 0;

    for (const v of videos) {
      if (v.driveFileId && !files.some((f) => f.id === v.driveFileId)) {
        await prisma.studyVideo.update({ where: { id: v.id }, data: { driveFileId: null, driveUploadedAt: null } });
        cleared++;
      }
    }
    for (const [path, f] of byPath) {
      const order = WATCH_PLAN.findIndex((p) => p.localPath === path);
      if (order < 0) continue;
      const plan = WATCH_PLAN[order];
      if (Number(f.size) !== plan.bytes) continue; // incomplete or different file
      const v = byLocal.get(path);
      if (v?.driveFileId === f.id) continue;
      if (v) await prisma.studyVideo.update({ where: { id: v.id }, data: { driveFileId: f.id, driveUploadedAt: new Date() } });
      else
        await prisma.studyVideo.create({
          data: {
            userId,
            subject: plan.subject,
            title: plan.title,
            section: plan.section,
            localPath: plan.localPath,
            durationMinutes: plan.minutes,
            order,
            driveFileId: f.id,
            driveUploadedAt: new Date(),
          },
        });
      linked++;
    }
    refresh();
    return { error: null, message: `Drive checked: ${files.length} file${files.length === 1 ? "" : "s"} in the folder${linked ? `, ${linked} linked` : ""}${cleared ? `, ${cleared} missing removed from the list` : ""}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectDriveAction(): Promise<DriveActionResult> {
  const userId = await requireUserId();
  if (!userId) return { error: "Not logged in." };
  await revoke(userId);
  refresh();
  return { error: null };
}
