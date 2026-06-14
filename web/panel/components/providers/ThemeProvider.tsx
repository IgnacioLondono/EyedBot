"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { usePanel } from "@/components/providers/PanelProvider";
import {
  DEFAULT_THEME,
  normalizePanelTheme,
  type PanelThemeSettings,
  type ThemePresetId,
  applyPreset,
} from "@/lib/theme-presets";
import {
  clearWallpaperFromIdb,
  saveWallpaperToIdb,
  useWallpaperBlobUrl,
} from "@/lib/hooks/useWallpaperStorage";

const STORAGE_KEY = "eyedbot_theme_settings_v1";
const LEGACY_STORAGE_KEY = "eyedbot-panel-theme";

type ThemeContextValue = {
  theme: PanelThemeSettings;
  wallpaperUrl: string | null;
  setTheme: (theme: Partial<PanelThemeSettings>) => void;
  applyThemePreset: (presetId: ThemePresetId) => void;
  resetTheme: () => void;
  refreshWallpaper: () => Promise<void>;
  uploadWallpaper: (file: File) => Promise<{ kind: "image" | "video"; mime: string } | null>;
  premiumLocked: boolean;
  hasActiveWallpaper: boolean;
};

function readInitialTheme(): PanelThemeSettings {
  if (typeof window === "undefined") return DEFAULT_THEME;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return normalizePanelTheme(JSON.parse(raw) as Partial<PanelThemeSettings>);
    } catch {
      return DEFAULT_THEME;
    }
  }

  const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy) as { accent?: string; accent2?: string; panelGlow?: string };
      return normalizePanelTheme({
        ...DEFAULT_THEME,
        accentPrimary: parsed.accent || DEFAULT_THEME.accentPrimary,
        accentSecondary: parsed.accent2 || DEFAULT_THEME.accentSecondary,
      });
    } catch {
      return DEFAULT_THEME;
    }
  }

  return DEFAULT_THEME;
}

function applyThemeCss(theme: PanelThemeSettings, wallpaperUrl: string | null) {
  const root = document.documentElement;
  const patternStrength = theme.atmosphere / 100;
  const borderStrength = theme.borderStrength / 100;

  root.style.setProperty("--color-accent", theme.accentPrimary);
  root.style.setProperty("--color-accent-2", theme.accentSecondary);
  root.style.setProperty("--color-glow", theme.accentPrimary);
  root.style.setProperty("--color-ring", theme.accentSecondary);
  root.style.setProperty("--shadow-accent", `${theme.accentPrimary}55`);
  root.style.setProperty("--color-bg", theme.bgPrimary);
  root.style.setProperty("--background", theme.bgPrimary);
  root.style.setProperty("--color-surface", theme.bgCard);
  root.style.setProperty("--color-surface-strong", theme.bgSecondary);
  root.style.setProperty("--color-border", `${theme.borderColor}${Math.round(40 + borderStrength * 60).toString(16).padStart(2, "0")}`);
  root.style.setProperty("--foreground", theme.textPrimary);
  root.style.setProperty("--theme-text-secondary", theme.textSecondary);
  root.style.setProperty("--theme-atmosphere", String(patternStrength));
  root.style.setProperty("--user-wallpaper-blur", `${28 + (theme.wallpaperBloom / 100) * 76}px`);
  root.style.setProperty("--user-wallpaper-bloom-opacity", String(0.14 + (theme.wallpaperBloom / 100) * 0.52));
  root.style.setProperty("--user-wallpaper-veil-opacity", String(0.35 + (theme.wallpaperVeil / 100) * 0.45));

  const hasWallpaperMedia =
    theme.wallpaperEnabled &&
    ((theme.wallpaperStorage === "inline" && theme.wallpaperUrl) ||
      (theme.wallpaperStorage === "indexeddb" && wallpaperUrl));

  if (theme.wallpaperEnabled && theme.wallpaperStorage !== "none") {
    root.dataset.wallpaper = theme.wallpaperKind === "video" ? "video" : "image";
    if (hasWallpaperMedia) {
      const url = theme.wallpaperStorage === "indexeddb" ? wallpaperUrl : theme.wallpaperUrl;
      root.style.setProperty("--user-wallpaper-image", `url("${url}")`);
      root.dataset.wallpaperVideo = theme.wallpaperKind === "video" ? url || "" : "";
    }
  } else {
    root.style.removeProperty("--user-wallpaper-image");
    delete root.dataset.wallpaper;
    delete root.dataset.wallpaperVideo;
  }

  root.dataset.themeBubbles = theme.backgroundBubbles ? "1" : "0";
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { premiumLocked } = usePanel();
  const [theme, setThemeState] = useState<PanelThemeSettings>(readInitialTheme);
  const { blobUrl, refreshWallpaper, primeBlobUrl } = useWallpaperBlobUrl(
    theme.wallpaperEnabled,
    theme.wallpaperStorage
  );

  const wallpaperUrl =
    theme.wallpaperEnabled && theme.wallpaperStorage === "indexeddb"
      ? blobUrl
      : theme.wallpaperEnabled && theme.wallpaperStorage === "inline"
        ? theme.wallpaperUrl
        : null;

  const hasActiveWallpaper = Boolean(
    theme.wallpaperEnabled &&
      ((theme.wallpaperStorage === "indexeddb" && blobUrl) ||
        (theme.wallpaperStorage === "inline" && theme.wallpaperUrl))
  );

  useEffect(() => {
    applyThemeCss(theme, wallpaperUrl);
  }, [theme, wallpaperUrl]);

  const persist = useCallback((next: PanelThemeSettings) => {
    const forDisk = { ...next };
    if (forDisk.wallpaperStorage === "indexeddb") {
      forDisk.wallpaperUrl = "";
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(forDisk));
    return next;
  }, []);

  const setTheme = useCallback(
    (patch: Partial<PanelThemeSettings>) => {
      if (premiumLocked) return;
      setThemeState((current) => persist(normalizePanelTheme({ ...current, ...patch })));
    },
    [premiumLocked, persist]
  );

  const applyThemePreset = useCallback(
    (presetId: ThemePresetId) => {
      if (premiumLocked) return;
      setThemeState((current) => persist(applyPreset(presetId, current)));
    },
    [premiumLocked, persist]
  );

  const resetTheme = useCallback(() => {
    void clearWallpaperFromIdb();
    setThemeState(persist(DEFAULT_THEME));
  }, [persist]);

  const uploadWallpaper = useCallback(
    async (file: File) => {
      if (premiumLocked) return null;
      primeBlobUrl(file);
      const { kind, mime } = await saveWallpaperToIdb(file);
      setThemeState((current) =>
        persist(
          normalizePanelTheme({
            ...current,
            wallpaperEnabled: true,
            wallpaperStorage: "indexeddb",
            wallpaperKind: kind,
            wallpaperMime: mime,
            wallpaperUrl: "",
          })
        )
      );
      return { kind, mime };
    },
    [premiumLocked, primeBlobUrl, persist]
  );

  const value = useMemo(
    () => ({
      theme,
      wallpaperUrl,
      setTheme,
      applyThemePreset,
      resetTheme,
      refreshWallpaper,
      uploadWallpaper,
      premiumLocked,
      hasActiveWallpaper,
    }),
    [
      theme,
      wallpaperUrl,
      setTheme,
      applyThemePreset,
      resetTheme,
      refreshWallpaper,
      uploadWallpaper,
      premiumLocked,
      hasActiveWallpaper,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeSettings() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useThemeSettings debe usarse dentro de ThemeProvider");
  return context;
}

// Compat alias for old 3-color API
export type ThemeSettings = {
  accent: string;
  accent2: string;
  panelGlow: string;
};
