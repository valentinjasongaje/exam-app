import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";

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
    <div className="mx-auto flex w-full max-w-5xl flex-1 gap-8 px-4 py-8">
      <aside className="w-40 shrink-0">
        <nav className="flex flex-col gap-2 text-sm">
          <Link href="/admin/users">Users</Link>
          <Link href="/admin/content">Content</Link>
          <Link href="/admin/import">Import</Link>
        </nav>
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}
