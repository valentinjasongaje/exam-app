import { redirect } from "next/navigation";
import { auth } from "@/auth";
import ProgressTabs from "@/components/progress-tabs";

export default async function TrackerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:py-10">
      <ProgressTabs />
      {children}
    </main>
  );
}
