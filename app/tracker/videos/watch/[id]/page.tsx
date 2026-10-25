import { redirect } from "next/navigation";

/** Old player URL; the player moved to /watch/[id] (wider, with notes beside it). */
export default async function OldWatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/watch/${id}`);
}
