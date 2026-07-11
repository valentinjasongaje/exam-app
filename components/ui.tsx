import Link from "next/link";
import { clsx } from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  secondary:
    "border border-border-strong bg-bg-elevated text-ink hover:border-accent hover:text-accent",
  ghost: "text-ink-muted hover:bg-bg-muted hover:text-ink",
  danger: "border border-danger/40 text-danger hover:bg-danger-soft",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return clsx(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  href,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link href={href} className={buttonClasses(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-border bg-bg-elevated p-5",
        className
      )}
      {...props}
    />
  );
}

export function Badge({
  tone = "muted",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "muted" | "accent" | "success" | "danger";
}) {
  const tones: Record<string, string> = {
    muted: "bg-bg-muted text-ink-muted",
    accent: "bg-accent-soft text-accent",
    success: "bg-success-soft text-success",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1.5 text-xs font-medium tracking-wide text-accent uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-bg-muted/40 px-6 py-10 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}
