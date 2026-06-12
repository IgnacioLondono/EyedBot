"use client";

import { useThemeSettings } from "@/components/providers/ThemeProvider";

export function WallpaperLayer() {
  const { theme, wallpaperUrl } = useThemeSettings();

  if (!theme.wallpaperEnabled || !wallpaperUrl) {
    return null;
  }

  const bloom = theme.wallpaperBloom / 100;
  const veil = theme.wallpaperVeil / 100;
  const blurPx = 8 + bloom * 72;
  const veilOpacity = 0.35 + veil * 0.45;
  const isVideo = theme.wallpaperKind === "video";

  const mediaStyle = {
    filter: `blur(${blurPx}px)`,
    transform: "scale(1.08)",
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {isVideo ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          style={mediaStyle}
          src={wallpaperUrl}
          autoPlay
          muted
          loop
          playsInline
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="absolute inset-0 h-full w-full object-cover" style={mediaStyle} src={wallpaperUrl} alt="" />
      )}
      <div className="absolute inset-0" style={{ backgroundColor: `rgba(0, 0, 0, ${veilOpacity})` }} />
    </div>
  );
}
