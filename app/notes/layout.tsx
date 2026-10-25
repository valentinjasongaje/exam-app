import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function NotesLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">{children}</main>;
}
