"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "accent" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-[color:var(--color-accent)]/35 bg-[linear-gradient(135deg,var(--color-accent),var(--color-accent-2))] text-[color:var(--color-btn-on-accent,#fff)] shadow-[0_10px_30px_var(--shadow-accent)] hover:brightness-110",
  secondary:
    "border border-[color:var(--color-btn-secondary-border,rgba(255,255,255,0.14))] bg-[color:var(--color-btn-secondary-bg,rgba(255,255,255,0.08))] text-[color:var(--color-btn-secondary-fg,#fff)] hover:brightness-110",
  accent:
    "border border-[color:var(--color-btn-accent-border)] bg-[color:var(--color-btn-accent-bg)] text-[color:var(--color-btn-accent-fg,#fff)] shadow-[0_8px_24px_rgba(0,0,0,0.28)] hover:brightness-110",
  ghost:
    "border border-transparent bg-transparent text-zinc-300 hover:border-white/10 hover:bg-white/6 hover:text-white",
  danger:
    "border border-red-400/30 bg-red-500/15 text-red-100 hover:bg-red-500/24",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
  icon: "h-10 w-10 justify-center",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, disabled, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition-all duration-200 outline-none ring-0",
        "focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
        "disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {children}
    </button>
  );
});
