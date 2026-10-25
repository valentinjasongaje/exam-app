import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Wider than the tracker pages so the player and notes fit side by side. */
export default async function WatchLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>;
}
