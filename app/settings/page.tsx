import { Cloud, Settings, SlidersHorizontal } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import SettingsForm from "./settings-form";
import DriveVideos from "./drive-videos";
import { PageHeader, Card } from "@/components/ui";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = session.user.role === "ADMIN";
  const [user, driveVideos, drive] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id } }),
    prisma.studyVideo.findMany({
      where: {
        userId: session.user.id,
        driveFileId: { not: null },
        ...(isAdmin ? {} : { id: "-" }),
      },
      orderBy: { order: "asc" },
      select: {
        id: true,
        title: true,
        watchedMinutes: true,
        durationMinutes: true,
      },
    }),
    prisma.driveConnection.findUnique({
      where: { userId: session.user.id },
      select: { googleEmail: true },
    }),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-10">
      <PageHeader icon={Settings} eyebrow="Preferences" title="Settings" />
      <Card className="mb-6">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <SlidersHorizontal size={17} className="text-accent" /> Exams
        </h2>
        <p className="mb-4 text-sm text-ink-muted">
          Applies to exams you start from now on.
        </p>
        <SettingsForm
          initialLayout={user.preferredLayout}
          initialShuffle={user.shuffleEnabled}
          initialInstantFeedback={user.instantFeedback}
        />
      </Card>
      {isAdmin && (
        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-semibold">
            <Cloud size={17} className="text-accent" /> Videos on Google Drive
          </h2>
          <p className="mb-4 text-sm text-ink-muted">
            {drive
              ? drive.googleEmail
                ? `Connected as ${drive.googleEmail}. `
                : "Connected. "
              : "Google Drive isn't connected. Connect it from Lessons → Videos. "}
            Remove videos you&rsquo;re done with to free space.
          </p>
          <DriveVideos
            videos={driveVideos.map((v) => ({
              id: v.id,
              title: v.title,
              watched: v.watchedMinutes >= v.durationMinutes,
            }))}
          />
        </Card>
      )}
    </main>
  );
}
