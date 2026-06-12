"use client";

import { useThemeSettings } from "@/components/providers/ThemeProvider";

export function WallpaperLayer() {
  const { theme, wallpaperUrl } = useThemeSettings();

  if (!theme.wallpaperEnabled || !wallpaperUrl || theme.wallpaperKind !== "video") {
    return null;
  }

  return (
    <video
      className="pointer-events-none fixed inset-0 z-[-3] h-full w-full object-cover"
      src={wallpaperUrl}
      autoPlay
      muted
      loop
      playsInline
    />
  );
}
