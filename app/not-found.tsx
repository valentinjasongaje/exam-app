import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex w-full flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <p className="text-xs font-medium tracking-wide text-accent uppercase">404</p>
      <h1 className="font-serif text-2xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-ink-muted">
        This page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <LinkButton href="/dashboard" variant="secondary">
        Back to dashboard
      </LinkButton>
    </main>
  );
}
