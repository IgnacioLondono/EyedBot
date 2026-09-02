import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`glass-panel rounded-[var(--radius-lg)] p-5 ${className}`}
    >
      {children}
    </div>
  );
}
