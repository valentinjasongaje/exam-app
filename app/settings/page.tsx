import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import SettingsForm from "./settings-form";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold">Settings</h1>
      <SettingsForm initialLayout={user.preferredLayout} initialShuffle={user.shuffleEnabled} />
    </main>
  );
}
