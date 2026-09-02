import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "premium" | "success" | "warning" | "danger";

const styles: Record<BadgeVariant, string> = {
  default:
    "border-[color:var(--color-border-subtle)] bg-[color-mix(in_srgb,var(--foreground)_6%,var(--color-surface-strong))] text-[var(--foreground)]",
  premium:
    "border-[color:var(--color-accent)]/30 bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-surface-strong))] text-[color:var(--color-accent)]",
  success:
    "border-emerald-600/25 bg-emerald-500/12 text-[color:var(--badge-success-text,#047857)]",
  warning:
    "border-amber-600/25 bg-amber-500/12 text-[color:var(--badge-warning-text,#b45309)]",
  danger: "border-red-600/25 bg-red-500/12 text-[color:var(--badge-danger-text,#b91c1c)]",
};

export function Badge({
  children,
  className,
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  variant?: BadgeVariant;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide",
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
