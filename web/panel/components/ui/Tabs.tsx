"use client";

import { useId, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type TabItem = {
  id: string;
  label: string;
  badge?: string;
};

type TabsProps = {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
};

export function Tabs({ items, value, onValueChange, className }: TabsProps) {
  const reactId = useId();
  const stripRef = useRef<HTMLDivElement>(null);
  const savedWindowScrollY = useRef(0);
  const savedStripScrollLeft = useRef(0);

  const handleSelect = (id: string) => {
    savedWindowScrollY.current = window.scrollY;
    savedStripScrollLeft.current = stripRef.current?.scrollLeft ?? 0;
    onValueChange(id);
    requestAnimationFrame(() => {
      window.scrollTo(0, savedWindowScrollY.current);
      if (stripRef.current) {
        stripRef.current.scrollLeft = savedStripScrollLeft.current;
      }
    });
  };

  return (
    <div
      ref={stripRef}
      className={cn("panel-tabs panel-scroll flex w-full max-w-full gap-2 overflow-x-auto p-1", className)}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handleSelect(item.id)}
            className={cn(
              "panel-tabs-trigger relative inline-flex shrink-0 items-center gap-2 overflow-hidden rounded-2xl px-4 py-2 text-sm whitespace-nowrap transition",
              active && "panel-tabs-trigger-active"
            )}
          >
            {active ? (
              <motion.span
                layoutId={`tabs-pill-${reactId}`}
                className="absolute inset-0 rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_16%,var(--color-surface-strong))]"
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
              />
            ) : null}
            <span className="relative z-10">{item.label}</span>
            {item.badge ? (
              <span className="relative z-10 text-[10px] text-[color:var(--theme-text-secondary)]">
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
