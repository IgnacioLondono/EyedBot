"use client";

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
  return (
    <div
      className={cn(
        "panel-scroll flex w-full max-w-full gap-2 overflow-x-auto rounded-3xl border border-white/10 bg-white/5 p-1",
        className
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onValueChange(item.id)}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-2 overflow-hidden rounded-2xl px-4 py-2 text-sm whitespace-nowrap transition",
              active ? "text-white" : "text-zinc-400 hover:text-white"
            )}
          >
            {active ? (
              <motion.span
                layoutId="tabs-pill"
                className="absolute inset-0 rounded-2xl bg-[linear-gradient(135deg,rgba(139,92,246,0.35),rgba(217,70,239,0.28))]"
              />
            ) : null}
            <span className="relative z-10">{item.label}</span>
            {item.badge ? <span className="relative z-10 text-[10px] text-zinc-300">{item.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
