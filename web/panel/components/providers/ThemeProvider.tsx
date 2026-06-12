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

export type ThemeSettings = {
  accent: string;
  accent2: string;
  panelGlow: string;
};

type ThemeContextValue = {
  theme: ThemeSettings;
  setTheme: (theme: Partial<ThemeSettings>) => void;
  resetTheme: () => void;
  premiumLocked: boolean;
};

const STORAGE_KEY = "eyedbot-panel-theme";

const defaultTheme: ThemeSettings = {
  accent: "#8b5cf6",
  accent2: "#d946ef",
  panelGlow: "#7c3aed",
};

function readInitialTheme(): ThemeSettings {
  if (typeof window === "undefined") return defaultTheme;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultTheme;
  try {
    return { ...defaultTheme, ...(JSON.parse(raw) as Partial<ThemeSettings>) };
  } catch {
    return defaultTheme;
  }
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeSettings) {
  const root = document.documentElement;
  root.style.setProperty("--color-accent", theme.accent);
  root.style.setProperty("--color-accent-2", theme.accent2);
  root.style.setProperty("--color-glow", theme.panelGlow);
  root.style.setProperty("--shadow-accent", `${theme.panelGlow}55`);
  root.style.setProperty("--color-ring", theme.accent2);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { hasPremium } = usePanel();
  const [theme, setThemeState] = useState<ThemeSettings>(readInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Partial<ThemeSettings>) => {
    if (!hasPremium) return;
    setThemeState((current) => {
      const merged = { ...current, ...next };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    });
  }, [hasPremium]);
  const resetTheme = useCallback(() => {
    setThemeState(defaultTheme);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultTheme));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      resetTheme,
      premiumLocked: !hasPremium,
    }),
    [theme, hasPremium, resetTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeSettings() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useThemeSettings debe usarse dentro de ThemeProvider");
  return context;
}
