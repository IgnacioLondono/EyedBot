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
    "border border-[color:var(--color-btn-accent-border)] bg-[color:var(--color-btn-accent-bg)] text-[color:var(--color-btn-on-accent,#fff)] shadow-sm hover:brightness-[1.04]",
  secondary:
    "border border-[color:var(--color-btn-secondary-border,rgba(255,255,255,0.14))] bg-[color:var(--color-btn-secondary-bg,rgba(255,255,255,0.08))] text-[color:var(--color-btn-secondary-fg,#fff)] hover:brightness-[1.04]",
  accent:
    "border border-[color:var(--color-btn-accent-border)] bg-[color:var(--color-btn-accent-bg)] text-[color:var(--color-btn-accent-fg,#fff)] hover:brightness-[1.04]",
  ghost:
    "border border-transparent bg-transparent text-[color:var(--theme-text-secondary)] hover:border-[color:var(--color-border-subtle)] hover:bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] hover:text-[var(--foreground)]",
  danger:
    "border border-red-500/30 bg-red-500/10 text-[color:var(--badge-danger-text,#fecaca)] hover:bg-red-500/16",
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
