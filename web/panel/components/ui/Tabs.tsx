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
    // Evita el salto al top cuando el contenido de la pestaña cambia de altura
    // o cuando Framer Motion anima el pill.
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
            onClick={() => handleSelect(item.id)}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-2 overflow-hidden rounded-2xl px-4 py-2 text-sm whitespace-nowrap transition",
              active ? "text-white" : "text-zinc-400 hover:text-white"
            )}
          >
            {active ? (
              <motion.span
                layoutId={`tabs-pill-${reactId}`}
                className="absolute inset-0 rounded-2xl bg-[linear-gradient(135deg,rgba(139,92,246,0.35),rgba(217,70,239,0.28))]"
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
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
