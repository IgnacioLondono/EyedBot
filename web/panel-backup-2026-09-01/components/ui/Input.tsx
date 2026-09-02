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
        "h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white placeholder:text-zinc-500",
        "backdrop-blur-md outline-none transition focus:border-[color:var(--color-ring)] focus:bg-black/30",
        className
      )}
      {...props}
    />
  );
});
