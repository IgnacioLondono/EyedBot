import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "premium" | "success" | "warning" | "danger";

const styles: Record<BadgeVariant, string> = {
  default: "border-white/10 bg-white/8 text-zinc-200",
  premium: "border-[color:var(--color-accent)]/25 bg-[color:var(--color-accent)]/15 text-[color:var(--color-brand-light)]",
  success: "border-emerald-400/20 bg-emerald-500/15 text-emerald-100",
  warning: "border-amber-400/20 bg-amber-500/15 text-amber-100",
  danger: "border-red-400/20 bg-red-500/15 text-red-100",
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
