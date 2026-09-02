"use client";

import { useRef } from "react";
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

/** Pestañas estilo AutoMod: subrayado, menos redondeo. */
export function Tabs({ items, value, onValueChange, className }: TabsProps) {
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
      className={cn("panel-tabs-automod panel-scroll flex w-full max-w-full gap-1 overflow-x-auto", className)}
      role="tablist"
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => handleSelect(item.id)}
            className={cn("panel-tabs-automod-trigger", active && "panel-tabs-automod-trigger-active")}
          >
            <span>{item.label}</span>
            {item.badge ? (
              <span className="text-[10px] text-[color:var(--theme-text-secondary)]">{item.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
