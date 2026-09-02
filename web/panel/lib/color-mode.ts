export type PanelColorMode = "light" | "dark" | "system";

const STORAGE_KEY = "eyedbot_panel_color_mode_v1";

const LIGHT_SURFACE = {
  bg: "#f4f4f5",
  bgSecondary: "#ffffff",
  bgCard: "#ffffff",
  text: "#18181b",
  textSecondary: "#52525b",
  borderSubtle: "rgba(0, 0, 0, 0.08)",
  glass: "rgba(255, 255, 255, 0.92)",
  glassStrong: "rgba(255, 255, 255, 0.98)",
};

const DARK_SURFACE = {
  bg: "#08070f",
  bgSecondary: "#12101c",
  bgCard: "#181525",
  text: "#f4f4f5",
  textSecondary: "#a1a1aa",
  borderSubtle: "rgba(255, 255, 255, 0.08)",
  glass: "rgba(12, 10, 20, 0.72)",
  glassStrong: "rgba(8, 7, 15, 0.88)",
};

export function readPanelColorMode(): PanelColorMode {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "dark";
}

export function persistPanelColorMode(mode: PanelColorMode) {
  window.localStorage.setItem(STORAGE_KEY, mode);
}

export function resolveEffectiveColorMode(mode: PanelColorMode): "light" | "dark" {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

function applySurfaceTokens(effective: "light" | "dark") {
  const root = document.documentElement;
  const surface = effective === "light" ? LIGHT_SURFACE : DARK_SURFACE;
  root.style.setProperty("--panel-surface-bg", surface.bg);
  root.style.setProperty("--panel-surface-secondary", surface.bgSecondary);
  root.style.setProperty("--panel-surface-card", surface.bgCard);
  root.style.setProperty("--panel-surface-text", surface.text);
  root.style.setProperty("--panel-surface-muted", surface.textSecondary);
  root.style.setProperty("--color-border-subtle", surface.borderSubtle);
  root.style.setProperty("--glass-bg", surface.glass);
  root.style.setProperty("--glass-bg-strong", surface.glassStrong);

  if (effective === "light") {
    root.style.setProperty("--color-bg", surface.bg);
    root.style.setProperty("--background", surface.bg);
    root.style.setProperty("--foreground", surface.text);
    root.style.setProperty("--color-surface-strong", surface.bgSecondary);
    root.style.setProperty("--color-surface", surface.bgCard);
    root.style.setProperty("--theme-text-secondary", surface.textSecondary);
  }
}

export function applyPanelColorMode(mode: PanelColorMode) {
  const root = document.documentElement;
  const effective = resolveEffectiveColorMode(mode);
  root.dataset.colorMode = effective;
  root.dataset.colorModePref = mode;
  applySurfaceTokens(effective);
}
