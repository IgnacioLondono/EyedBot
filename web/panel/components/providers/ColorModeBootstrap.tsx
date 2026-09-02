"use client";

import { useEffect } from "react";
import { applyPanelColorMode, readPanelColorMode } from "@/lib/color-mode";

export function ColorModeBootstrap() {
  useEffect(() => {
    applyPanelColorMode(readPanelColorMode());
  }, []);

  return null;
}
