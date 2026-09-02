"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-strong)] px-4 text-sm text-[var(--foreground)] placeholder:text-[var(--theme-text-secondary)]",
        "outline-none transition focus:border-[color:var(--color-ring)] focus:bg-[var(--color-surface)]",
        className
      )}
      {...props}
    />
  );
});
