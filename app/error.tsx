"use client";

import { Button } from "@/components/ui";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex w-full flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <p className="text-xs font-medium tracking-wide text-accent uppercase">
        Something went wrong
      </p>
      <h1 className="max-w-md font-serif text-2xl font-semibold">
        That didn&apos;t work — but your answers are safe.
      </h1>
      <p className="max-w-sm text-sm text-ink-muted">
        This is usually a brief database wake-up. Trying again almost always fixes it.
        {error.digest && <span className="mt-1 block text-xs text-ink-faint">Ref: {error.digest}</span>}
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
