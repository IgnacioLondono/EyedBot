import type { WebPanelConfig } from "@/lib/types";
import type { NavItem, ServerPane } from "@/lib/navigation";

const PAGE_ROUTE_MAP: Record<string, keyof WebPanelConfig["pages"]> = {
  "/dashboard": "dashboard",
  "/about": "about",
  "/commands": "commands",
  "/premium": "premium",
};

const SETTINGS_ROUTE_MAP: Record<string, keyof WebPanelConfig["modules"]> = {
  "/settings/theme": "themeCustomization",
};

const SERVER_MODULE_MAP: Record<string, keyof WebPanelConfig["modules"]> = {
  welcome: "welcome",
  verify: "verify",
  tickets: "tickets",
  levels: "levels",
  voice: "voice",
  automation: "automation",
  gacha: "gacha",
  moderation: "moderation",
  security: "security",
  notifications: "notifications",
  "free-games": "freeGames",
  embed: "embed",
};

export function isWebPageEnabled(webConfig: WebPanelConfig | null | undefined, href: string) {
  if (!webConfig?.pages) return true;
  const key = PAGE_ROUTE_MAP[href];
  if (!key) return true;
  return webConfig.pages[key] !== false;
}

export function filterPrimaryNav(
  items: NavItem[],
  webConfig: WebPanelConfig | null | undefined
) {
  return items.filter((item) => isWebPageEnabled(webConfig, item.href));
}

export function filterSettingsNav(
  items: NavItem[],
  webConfig: WebPanelConfig | null | undefined
) {
  return items.filter((item) => {
    const moduleKey = SETTINGS_ROUTE_MAP[item.href];
    if (!moduleKey) return true;
    return webConfig?.modules?.[moduleKey] !== false;
  });
}

export function filterServerPanes(
  panes: ServerPane[],
  webConfig: WebPanelConfig | null | undefined
) {
  return panes.filter((pane) => {
    const moduleKey = SERVER_MODULE_MAP[pane.slug];
    if (!moduleKey) return true;
    return webConfig?.modules?.[moduleKey] !== false;
  });
}

export const WEB_MODULE_LABELS: Record<keyof WebPanelConfig["modules"], string> = {
  welcome: "Bienvenida",
  verify: "Verificación",
  tickets: "Tickets",
  levels: "Niveles",
  voice: "Voz temporal",
  automation: "Automatización",
  gacha: "Gacha",
  moderation: "Moderación",
  security: "Seguridad",
  notifications: "Alertas",
  freeGames: "Juegos gratis",
  embed: "Embeds",
  themeCustomization: "Personalización del tema",
};

export const WEB_PAGE_LABELS: Record<keyof WebPanelConfig["pages"], string> = {
  dashboard: "Dashboard",
  about: "Acerca de",
  commands: "Comandos",
  premium: "EyedPlus+",
};
