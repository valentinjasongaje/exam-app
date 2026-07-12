import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AdminNav from "./admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 sm:flex-row sm:gap-8">
      <aside className="w-full shrink-0 sm:w-44">
        <p className="mb-3 px-3 text-xs font-medium tracking-wide text-accent uppercase">
          Admin
        </p>
        <AdminNav />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
