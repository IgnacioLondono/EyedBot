"use client";

import { forwardRef, type LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, ...props },
  ref
) {
  return (
    <label
      ref={ref}
      className={cn("text-sm font-medium text-zinc-200", className)}
      {...props}
    />
  );
});
