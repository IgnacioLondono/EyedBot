"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LogIn, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PRIMARY_NAV } from "@/lib/navigation";
import { filterPrimaryNav } from "@/lib/web-config";
import { EYEDBIO_URL } from "@/lib/eyedbio";
import { EyedBotLogo } from "@/components/brand/EyedBotLogo";
import { PanelSidebar } from "@/components/layout/PanelSidebar";
import { isPublicPanelRoute } from "@/lib/public-routes";
import { usePanel } from "@/components/providers/PanelProvider";
import { discordAvatarUrl } from "@/lib/discord-media";
import { cn } from "@/lib/utils";
import { WallpaperLayer } from "@/components/layout/WallpaperLayer";
import { useThemeSettings } from "@/components/providers/ThemeProvider";
import { resolvePanelBrand } from "@/lib/brand";
import { PanelTenantSwitcher } from "@/components/layout/PanelTenantSwitcher";

export function PanelShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { bootstrap } = usePanel();
  const { hasActiveWallpaper, theme } = useThemeSettings();
  const showWallpaper = hasActiveWallpaper && !theme.neutralUi;
  const showBubbles = theme.backgroundBubbles && !theme.neutralUi;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const user = bootstrap?.user;
  const isGuest = !user;
  const homeHref = isGuest ? "/about" : "/dashboard";
  const primaryNav = filterPrimaryNav(PRIMARY_NAV, bootstrap?.webConfig);
  const maintenanceMessage = bootstrap?.webConfig?.maintenanceMessage;
  const showMaintenanceNotice = Boolean(bootstrap?.isRealOwner && bootstrap?.webConfig?.maintenanceMode);
  const brand = resolvePanelBrand(bootstrap?.tenant);
  const brandLabel = brand.isTenant ? `${brand.name} Panel` : "EyedBot Panel";
  const isDocs = pathname === "/docs" || pathname.startsWith("/docs/");
  const isCardStudio = pathname.includes("/welcome/studio");

  useEffect(() => {
    document.documentElement.dataset.layout = isDocs ? "docs" : "";
    return () => {
      delete document.documentElement.dataset.layout;
    };
  }, [isDocs]);

  useEffect(() => {
    if (!brand.isTenant) return;
    const root = document.documentElement;
    root.style.setProperty("--color-accent", brand.primaryColor);
    root.style.setProperty("--color-brand", brand.primaryColor);
  }, [brand.isTenant, brand.primaryColor]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="panel-shell relative min-h-screen bg-[var(--color-bg)] text-[var(--foreground)]">
      {showWallpaper ? <WallpaperLayer /> : null}
      {showBubbles ? (
      <div className="theme-bubbles pointer-events-none fixed inset-0 z-[1] overflow-hidden opacity-100 transition-opacity">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-[color:var(--color-accent)]/20 blur-3xl" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-[color:var(--color-accent-2)]/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-[color:var(--color-glow)]/10 blur-3xl" />
      </div>
      ) : null}

      {showMaintenanceNotice ? (
        <div className="relative z-50 border-b border-amber-400/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-100">
          Modo mantenimiento activo para usuarios. {maintenanceMessage}
        </div>
      ) : null}

      {!isCardStudio ? <PanelSidebar className="hidden lg:flex" /> : null}

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Cerrar menú"
          />
          <PanelSidebar className="!flex shadow-2xl animate-in slide-in-from-left duration-200" />
        </div>
      ) : null}

      <div className={cn("relative z-10 flex min-h-screen flex-col", !isCardStudio && "lg:pl-[var(--panel-active-sidebar-width)]")}>
        {!isCardStudio ? (
        <header className="sticky top-0 z-40 border-b border-[var(--color-border-subtle)] bg-[var(--glass-bg)]/90 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-strong)] text-[color:var(--color-icon)]"
              aria-label="Abrir menú"
            >
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {brand.logoUrl ? (
              <Link href={homeHref} className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-[var(--foreground)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={brand.logoUrl} alt="" className="h-8 w-8 rounded-xl object-cover" />
                <span className="truncate">{brandLabel}</span>
              </Link>
            ) : (
              <EyedBotLogo href={homeHref} label={brandLabel} showText="desktop" className="min-w-0 flex-1 font-semibold" />
            )}

            <div className="flex items-center gap-2">
              {!isGuest ? <PanelTenantSwitcher /> : null}
              {isGuest ? (
                <Link
                  href="/login"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/15 text-[color:var(--color-brand-light)]"
                >
                  <LogIn className="h-4 w-4" />
                </Link>
              ) : (
                <Link href="/settings/account">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={discordAvatarUrl(user.id, user.avatar, 64)}
                    alt=""
                    className="h-9 w-9 rounded-full border border-white/10"
                  />
                </Link>
              )}
            </div>
          </div>
        </header>
        ) : null}

        <motion.main
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className={cn(
            "relative flex-1",
            isCardStudio
              ? "p-0"
              : isDocs
                ? "px-4 py-6 lg:px-10 lg:py-8"
                : "px-4 py-6 pb-24 lg:px-8 lg:pb-8 xl:px-10"
          )}
        >
          <div className={cn("mx-auto w-full", isCardStudio ? "max-w-none" : isDocs ? "max-w-3xl xl:max-w-4xl" : "max-w-[88rem]")}>
            {children}
          </div>
        </motion.main>

        {!isDocs && !isCardStudio ? (
        <div className="fixed inset-x-3 bottom-3 z-40 lg:hidden">
          <div className="glass-panel-strong grid grid-cols-6 rounded-lg p-1.5">
            {primaryNav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              const guestLocked = isGuest && !isPublicPanelRoute(item.href);
              const href = guestLocked ? "/login" : item.href;
              return (
                <Link
                  key={item.href}
                  href={href}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-md px-1 py-2 text-[10px] text-[var(--theme-text-secondary)] transition",
                    active && "bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-surface-strong))] text-[var(--foreground)]",
                    guestLocked && !active && "opacity-70"
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
            <a
              href={EYEDBIO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[10px] text-cyan-300"
            >
              <span className="text-[9px]">Eyed.bio</span>
            </a>
          </div>
        </div>
        ) : null}
      </div>
    </div>
  );
}
