export const COMMAND_CATEGORY_LABELS: Record<string, string> = {
  all: "Todas las categorías",
  config: "Configuración",
  fun: "Diversión",
  moderation: "Moderación",
  music: "Música",
  utility: "Utilidad",
  other: "Otros",
};

export const COMMAND_CATEGORY_ORDER = ["config", "fun", "moderation", "music", "utility", "other"] as const;

export function commandCategoryLabel(category?: string) {
  const key = String(category || "other").toLowerCase();
  return COMMAND_CATEGORY_LABELS[key] || category || COMMAND_CATEGORY_LABELS.other;
}

export function sortCommandCategories(categories: string[]) {
  return [...categories].sort((a, b) => {
    const ai = COMMAND_CATEGORY_ORDER.indexOf(a as (typeof COMMAND_CATEGORY_ORDER)[number]);
    const bi = COMMAND_CATEGORY_ORDER.indexOf(b as (typeof COMMAND_CATEGORY_ORDER)[number]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}
