import { Check, ShieldCheck, UserPlus, X } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui";
import { approveEmailAction, dismissRequestAction, revokeEmailAction } from "./access-actions";

const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

/** Who can sign in: pending requests, the approved list, and a box to add an email. */
export default async function AccessPanel({ myEmail }: { myEmail: string | null }) {
  const [requests, allowed] = await Promise.all([
    prisma.accessRequest.findMany({ orderBy: { lastTriedAt: "desc" } }),
    prisma.allowedEmail.findMany({ orderBy: { addedAt: "asc" } }),
  ]);

  return (
    <Card className="mb-8">
      <h2 className="flex items-center gap-2 font-semibold">
        <ShieldCheck size={18} className="text-accent" /> Who can sign in
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Only approved emails can log in. Someone else who tries is listed below as a request. Removing an email signs
        that person out within about 5 minutes.
      </p>

      {requests.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">Waiting for approval · {requests.length}</p>
          <ul className="flex flex-col gap-1.5">
            {requests.map((r) => (
              <li key={r.email} className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft/40 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{r.name || r.email}</span>
                  {r.name && <span className="block truncate text-xs text-ink-muted">{r.email}</span>}
                  <span className="block text-[11px] text-ink-faint">tried {fmt.format(r.lastTriedAt)}</span>
                </span>
                <form action={approveEmailAction}>
                  <input type="hidden" name="email" value={r.email} />
                  <button type="submit" className="inline-flex items-center gap-1 rounded-md bg-success px-2.5 py-1 text-xs font-medium text-bg">
                    <Check size={13} /> Approve
                  </button>
                </form>
                <form action={dismissRequestAction}>
                  <input type="hidden" name="email" value={r.email} />
                  <button type="submit" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-bg-muted">
                    <X size={13} /> Dismiss
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form action={approveEmailAction} className="mt-4 flex gap-2">
        <input name="email" type="email" required placeholder="name@gmail.com" aria-label="Email to approve" className="field min-w-0 flex-1" />
        <button type="submit" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-ink">
          <UserPlus size={15} /> Approve
        </button>
      </form>

      <p className="mt-5 mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">Approved · {allowed.length}</p>
      {allowed.length === 0 ? (
        <p className="text-sm text-ink-muted">Nobody yet. You (the admin) can always sign in.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {allowed.map((a) => (
            <li key={a.email} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{a.email}</span>
              {a.email === myEmail?.toLowerCase() ? (
                <span className="text-xs text-ink-faint">you</span>
              ) : (
                <form action={revokeEmailAction}>
                  <input type="hidden" name="email" value={a.email} />
                  <button type="submit" className="rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-danger-soft hover:text-danger">
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
