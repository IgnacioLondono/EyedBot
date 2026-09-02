"use client";

import type { LucideIcon, LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/** Trazo fino estilo AutoMod (lucide-react). */
export const PANEL_ICON_STROKE = 1.75;

export type PanelIconProps = LucideProps & {
  icon: LucideIcon;
  tone?: "default" | "muted" | "accent" | "inherit";
};

const toneClass: Record<NonNullable<PanelIconProps["tone"]>, string> = {
  inherit: "",
  default: "text-[color:var(--color-icon)]",
  muted: "text-[color:var(--color-icon-muted)]",
  accent: "text-[color:var(--color-accent)]",
};

export function PanelIcon({
  icon: Icon,
  tone = "inherit",
  className,
  strokeWidth = PANEL_ICON_STROKE,
  ...props
}: PanelIconProps) {
  return (
    <Icon
      className={cn("shrink-0", toneClass[tone], className)}
      strokeWidth={strokeWidth}
      aria-hidden={props["aria-label"] ? undefined : true}
      {...props}
    />
  );
}
