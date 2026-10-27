import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DriveError, accessTokenFor, getFile } from "@/lib/google-drive";
import { WATCH_PLAN } from "@/lib/video-library";

/** Called after a browser upload finishes: verify the file on Drive, then link it to the plan video. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const userId = session.user.id;
  const { localPath, fileId } = (await req.json().catch(() => ({}))) as { localPath?: string; fileId?: string };
  const order = WATCH_PLAN.findIndex((v) => v.localPath === localPath);
  if (order < 0 || !fileId) return NextResponse.json({ error: "Unknown video." }, { status: 400 });
  const plan = WATCH_PLAN[order];

  try {
    const { token } = await accessTokenFor(userId);
    const file = await getFile(token, fileId);
    if (file.trashed || Number(file.size) !== plan.bytes) {
      return NextResponse.json({ error: "The uploaded file doesn't match (size differs). Try uploading it again." }, { status: 409 });
    }
    const existing = await prisma.studyVideo.findFirst({ where: { userId, localPath: plan.localPath } });
    if (existing) {
      await prisma.studyVideo.update({ where: { id: existing.id }, data: { driveFileId: file.id, driveUploadedAt: new Date() } });
    } else {
      await prisma.studyVideo.create({
        data: {
          userId,
          subject: plan.subject,
          title: plan.title,
          section: plan.section,
          localPath: plan.localPath,
          durationMinutes: plan.minutes,
          order,
          driveFileId: file.id,
          driveUploadedAt: new Date(),
        },
      });
    }
    revalidatePath("/tracker", "layout");
    revalidatePath("/lessons", "layout");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e instanceof DriveError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Drive error" }, { status });
  }
}
