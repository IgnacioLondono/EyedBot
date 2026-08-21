/** Paleta principal inspirada en el icono EyedBot (#A78BFA). */
export const EYEDBOT_BRAND = {
  primary: "#a78bfa",
  light: "#c4b5fd",
  soft: "#ddd6fe",
  deep: "#7c3aed",
  ink: "#08070f",
  surface: "#12101c",
} as const;

export const EYEDBOT_MARK_VIEWBOX = "0 0 32 32";

/** Ojo en almendra (relleno suave, sin muescas). */
export const EYEDBOT_EYE_PATH = "M10 18Q16 14 22 18Q16 22 10 18Z";

export type PanelBrand = {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  isTenant: boolean;
};

export function resolvePanelBrand(tenant?: {
  brand?: { name?: string; logoUrl?: string; primaryColor?: string };
  label?: string;
} | null): PanelBrand {
  const name = String(tenant?.brand?.name || tenant?.label || "").trim();
  const logoUrl = String(tenant?.brand?.logoUrl || "").trim() || null;
  const rawColor = String(tenant?.brand?.primaryColor || "").replace("#", "").trim();
  const primaryColor =
    rawColor && /^[0-9a-fA-F]{6}$/.test(rawColor) ? `#${rawColor.toLowerCase()}` : EYEDBOT_BRAND.primary;
  if (!name && !logoUrl) {
    return {
      name: "EyedBot",
      logoUrl: null,
      primaryColor: EYEDBOT_BRAND.primary,
      isTenant: false,
    };
  }
  return {
    name: name || "Panel",
    logoUrl,
    primaryColor,
    isTenant: true,
  };
}
