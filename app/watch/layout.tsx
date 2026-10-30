import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Wider than the tracker pages so the player and notes fit side by side.
 * On big monitors (2xl) it grows up to 1800px, but only as wide as keeps the
 * whole video on screen: player width = (viewport height − header) × 16/9,
 * plus the 26rem notes column, gap and padding.
 */
export default async function WatchLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 2xl:max-w-[max(80rem,min(1800px,calc((100dvh_-_14rem)*16/9_+_29.5rem)))]">{children}</main>;
}
