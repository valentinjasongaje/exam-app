export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <div className="mb-8 flex flex-col gap-3">
        <div className="h-3 w-24 animate-pulse rounded bg-bg-muted" />
        <div className="h-7 w-64 animate-pulse rounded bg-bg-muted" />
      </div>
      <div className="flex flex-col gap-4">
        <div className="h-24 animate-pulse rounded-xl bg-bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-bg-muted" />
      </div>
    </main>
  );
}
