import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import SettingsForm from "./settings-form";
import { PageHeader, Card } from "@/components/ui";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        subtitle="Applies to exams you start from now on."
      />
      <Card>
        <SettingsForm
          initialLayout={user.preferredLayout}
          initialShuffle={user.shuffleEnabled}
          initialInstantFeedback={user.instantFeedback}
        />
      </Card>
    </main>
  );
}
