"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-28 w-full rounded-lg border border-[color:var(--color-border-subtle)] bg-[var(--color-surface-strong)] px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[color:var(--color-icon-muted)]",
        "outline-none transition focus:border-[color:var(--color-ring)]",
        className
      )}
      {...props}
    />
  );
});
