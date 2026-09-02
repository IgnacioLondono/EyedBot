import { isLightAccent } from "@/lib/theme-contrast";

export type PanelColorMode = "light" | "dark" | "system";

export type InteractionTokenOptions = {
  autoContrast?: boolean;
  textPrimary?: string;
};

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

export function applyInteractionTokens(
  effective: "light" | "dark",
  accent = "#a78bfa",
  opts: InteractionTokenOptions = {}
) {
  const root = document.documentElement;
  const autoContrast = opts.autoContrast !== false;
  const textPrimary = opts.textPrimary || (effective === "light" ? "#18181b" : "#f4f4f5");
  const onAccent =
    effective === "light" && autoContrast && isLightAccent(accent) ? "#18181b" : "#ffffff";

  if (effective === "light") {
    root.style.setProperty("--color-btn-on-accent", onAccent);
    root.style.setProperty("--color-btn-secondary-bg", "#ffffff");
    root.style.setProperty("--color-btn-secondary-border", "rgba(0, 0, 0, 0.14)");
    root.style.setProperty("--color-btn-secondary-fg", "#18181b");
    root.style.setProperty("--color-btn-accent-bg", accent);
    root.style.setProperty("--color-btn-accent-border", accent);
    root.style.setProperty("--color-btn-accent-fg", onAccent);
    root.style.setProperty("--color-icon", "#3f3f46");
    root.style.setProperty("--color-icon-muted", "#71717a");
    root.style.setProperty("--color-link", accent);
    root.style.setProperty("--badge-success-text", "#047857");
    root.style.setProperty("--badge-warning-text", "#b45309");
    root.style.setProperty("--badge-danger-text", "#b91c1c");
  } else {
    root.style.setProperty("--color-btn-on-accent", onAccent);
    root.style.setProperty("--color-btn-secondary-bg", "rgba(255,255,255,0.08)");
    root.style.setProperty("--color-btn-secondary-border", "rgba(255,255,255,0.14)");
    root.style.setProperty("--color-btn-secondary-fg", textPrimary);
    root.style.setProperty(
      "--color-btn-accent-bg",
      `color-mix(in srgb, ${accent} 24%, transparent)`
    );
    root.style.setProperty(
      "--color-btn-accent-border",
      `color-mix(in srgb, ${accent} 45%, transparent)`
    );
    root.style.setProperty("--color-btn-accent-fg", textPrimary);
    root.style.setProperty("--color-icon", "#e4e4e7");
    root.style.setProperty("--color-icon-muted", "#a1a1aa");
    root.style.setProperty("--color-link", "#c4b5fd");
    root.style.setProperty("--badge-success-text", "#a7f3d0");
    root.style.setProperty("--badge-warning-text", "#fde68a");
    root.style.setProperty("--badge-danger-text", "#fecaca");
  }
}

export function applyPanelColorMode(mode: PanelColorMode) {
  const root = document.documentElement;
  const effective = resolveEffectiveColorMode(mode);
  root.dataset.colorMode = effective;
  root.dataset.colorModePref = mode;
  applySurfaceTokens(effective);
  const accent = root.style.getPropertyValue("--color-accent").trim() || "#a78bfa";
  applyInteractionTokens(effective, accent);
  window.dispatchEvent(new CustomEvent("eyedbot:color-mode"));
}
