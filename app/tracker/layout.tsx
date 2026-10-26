import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { WATCH_PLAN } from "@/lib/video-library";
import TrackerNav from "./tracker-nav";
import LocalWatchPrompt from "./local-watch-prompt";

export default async function TrackerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // For the "you opened … on your laptop, log it?" prompt.
  const mine = await prisma.studyVideo.findMany({
    where: { userId: session.user.id, localPath: { not: null } },
    select: { localPath: true, watchedMinutes: true, durationMinutes: true },
  });
  const byPath = new Map(mine.map((v) => [v.localPath, v]));
  const plan = WATCH_PLAN.map((p) => {
    const v = byPath.get(p.localPath);
    return {
      localPath: p.localPath,
      title: p.title,
      minutes: p.minutes,
      watchedMinutes: v?.watchedMinutes ?? 0,
      done: !!v && v.watchedMinutes >= v.durationMinutes,
    };
  });

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <TrackerNav />
      <LocalWatchPrompt plan={plan} />
      {children}
    </main>
  );
}
