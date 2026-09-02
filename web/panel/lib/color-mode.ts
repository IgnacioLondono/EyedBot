export type PanelColorMode = "light" | "dark" | "system";

const STORAGE_KEY = "eyedbot_panel_color_mode_v1";

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

export function applyPanelColorMode(mode: PanelColorMode) {
  const root = document.documentElement;
  const effective = resolveEffectiveColorMode(mode);
  root.dataset.colorMode = effective;
  root.dataset.colorModePref = mode;
}
