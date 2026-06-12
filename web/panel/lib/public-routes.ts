/** Rutas del panel accesibles sin iniciar sesión. */
export const PUBLIC_PANEL_PATHS = ["/about", "/commands"] as const;

export function isPublicPanelRoute(pathname: string | null | undefined) {
  if (!pathname) return false;
  return PUBLIC_PANEL_PATHS.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}
