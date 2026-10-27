import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function DailyLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <>{children}</>;
}
