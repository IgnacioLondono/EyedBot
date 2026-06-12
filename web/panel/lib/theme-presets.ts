export type ThemePresetId = "midnight" | "aurora" | "ember" | "ocean" | "forest" | "mono" | "void";

export type ThemePresetColors = {
  accentPrimary: string;
  accentSecondary: string;
  bgPrimary: string;
  bgSecondary: string;
  bgCard: string;
  textPrimary: string;
  textSecondary: string;
  borderColor: string;
  atmosphere: number;
  borderStrength: number;
};

export const THEME_PRESETS: Record<ThemePresetId, ThemePresetColors> = {
  midnight: {
    accentPrimary: "#9a6dff",
    accentSecondary: "#ff78d1",
    bgPrimary: "#090512",
    bgSecondary: "#150c26",
    bgCard: "#1a1030",
    textPrimary: "#f4eeff",
    textSecondary: "#cbb7f6",
    borderColor: "#be9bff",
    atmosphere: 55,
    borderStrength: 28,
  },
  aurora: {
    accentPrimary: "#39d98a",
    accentSecondary: "#7bdcff",
    bgPrimary: "#071218",
    bgSecondary: "#0f1f2f",
    bgCard: "#13263a",
    textPrimary: "#effeff",
    textSecondary: "#b9e5f7",
    borderColor: "#7bdcff",
    atmosphere: 62,
    borderStrength: 25,
  },
  ember: {
    accentPrimary: "#ff8a4c",
    accentSecondary: "#ff4d7d",
    bgPrimary: "#150905",
    bgSecondary: "#27110c",
    bgCard: "#301617",
    textPrimary: "#fff3ed",
    textSecondary: "#ffd1bf",
    borderColor: "#ff8a4c",
    atmosphere: 58,
    borderStrength: 30,
  },
  ocean: {
    accentPrimary: "#4aa3ff",
    accentSecondary: "#22d3ee",
    bgPrimary: "#06111a",
    bgSecondary: "#102438",
    bgCard: "#14293d",
    textPrimary: "#eff8ff",
    textSecondary: "#c7e5ff",
    borderColor: "#4aa3ff",
    atmosphere: 60,
    borderStrength: 26,
  },
  forest: {
    accentPrimary: "#48d37c",
    accentSecondary: "#9ee37d",
    bgPrimary: "#07150c",
    bgSecondary: "#102517",
    bgCard: "#153122",
    textPrimary: "#f2fff5",
    textSecondary: "#cdecd6",
    borderColor: "#48d37c",
    atmosphere: 57,
    borderStrength: 24,
  },
  mono: {
    accentPrimary: "#d4d4d8",
    accentSecondary: "#a1a1aa",
    bgPrimary: "#0a0a0f",
    bgSecondary: "#15151d",
    bgCard: "#1a1a24",
    textPrimary: "#f8fafc",
    textSecondary: "#cbd5e1",
    borderColor: "#cbd5e1",
    atmosphere: 40,
    borderStrength: 18,
  },
  void: {
    accentPrimary: "#ffffff",
    accentSecondary: "#e5e5e5",
    bgPrimary: "#000000",
    bgSecondary: "#000000",
    bgCard: "#0d0d0d",
    textPrimary: "#ffffff",
    textSecondary: "#d4d4d8",
    borderColor: "#52525b",
    atmosphere: 35,
    borderStrength: 15,
  },
};

export const THEME_PRESET_LABELS: Record<ThemePresetId, string> = {
  midnight: "Midnight",
  aurora: "Aurora",
  ember: "Ember",
  ocean: "Ocean",
  forest: "Forest",
  mono: "Mono",
  void: "Void",
};

export type PanelThemeSettings = {
  preset: ThemePresetId;
  accentPrimary: string;
  accentSecondary: string;
  bgPrimary: string;
  bgSecondary: string;
  bgCard: string;
  textPrimary: string;
  textSecondary: string;
  borderColor: string;
  atmosphere: number;
  borderStrength: number;
  autoContrast: boolean;
  backgroundBubbles: boolean;
  wallpaperEnabled: boolean;
  wallpaperStorage: "none" | "inline" | "indexeddb";
  wallpaperKind: "image" | "video" | "none";
  wallpaperMime: string;
  wallpaperUrl: string;
  wallpaperBloom: number;
  wallpaperVeil: number;
  wallpaperBlur: boolean;
};

export const DEFAULT_THEME: PanelThemeSettings = {
  preset: "midnight",
  ...THEME_PRESETS.midnight,
  autoContrast: true,
  backgroundBubbles: false,
  wallpaperEnabled: false,
  wallpaperStorage: "none",
  wallpaperKind: "none",
  wallpaperMime: "",
  wallpaperUrl: "",
  wallpaperBloom: 42,
  wallpaperVeil: 38,
  wallpaperBlur: true,
};

export function clampThemeNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function normalizePanelTheme(input: Partial<PanelThemeSettings> = {}): PanelThemeSettings {
  const presetId = Object.prototype.hasOwnProperty.call(THEME_PRESETS, input.preset || "")
    ? (input.preset as ThemePresetId)
    : DEFAULT_THEME.preset;
  const preset = THEME_PRESETS[presetId] || THEME_PRESETS.midnight;

  return {
    preset: presetId,
    accentPrimary: String(input.accentPrimary || preset.accentPrimary),
    accentSecondary: String(input.accentSecondary || preset.accentSecondary),
    bgPrimary: String(input.bgPrimary || preset.bgPrimary),
    bgSecondary: String(input.bgSecondary || preset.bgSecondary),
    bgCard: String(input.bgCard || preset.bgCard),
    textPrimary: String(input.textPrimary || preset.textPrimary),
    textSecondary: String(input.textSecondary || preset.textSecondary),
    borderColor: String(input.borderColor || preset.borderColor),
    atmosphere: clampThemeNumber(input.atmosphere, 0, 100, preset.atmosphere),
    borderStrength: clampThemeNumber(input.borderStrength, 0, 100, preset.borderStrength),
    autoContrast: input.autoContrast !== false,
    backgroundBubbles: input.backgroundBubbles === true,
    wallpaperEnabled: input.wallpaperEnabled === true,
    wallpaperStorage:
      input.wallpaperStorage === "inline" || input.wallpaperStorage === "indexeddb"
        ? input.wallpaperStorage
        : "none",
    wallpaperKind:
      input.wallpaperKind === "image" || input.wallpaperKind === "video" ? input.wallpaperKind : "none",
    wallpaperMime: String(input.wallpaperMime || ""),
    wallpaperUrl: String(input.wallpaperUrl || ""),
    wallpaperBloom: clampThemeNumber(input.wallpaperBloom, 0, 100, DEFAULT_THEME.wallpaperBloom),
    wallpaperVeil: clampThemeNumber(input.wallpaperVeil, 0, 100, DEFAULT_THEME.wallpaperVeil),
    wallpaperBlur: input.wallpaperBlur !== false,
  };
}

export function applyPreset(presetId: ThemePresetId, current: PanelThemeSettings): PanelThemeSettings {
  const preset = THEME_PRESETS[presetId];
  return normalizePanelTheme({
    ...current,
    preset: presetId,
    ...preset,
  });
}
