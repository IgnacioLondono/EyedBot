"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Search,
  Server,
  Settings,
  Sparkles,
  Terminal,
  BookOpen,
} from "lucide-react";
import { EyedBotMark } from "@/components/brand/EyedBotMark";
import { usePanel } from "@/components/providers/PanelProvider";
import { discordAvatarUrl } from "@/lib/discord-media";
import { resolvePanelBrand } from "@/lib/brand";
import {
  PRIMARY_NAV,
  SETTINGS_NAV,
  SERVER_PANE_GROUPS,
  SERVER_PANES,
  serverPaneHref,
} from "@/lib/navigation";
import { filterPrimaryNav, filterServerPanes, filterSettingsNav } from "@/lib/web-config";
import { isPublicPanelRoute } from "@/lib/public-routes";
import { getGuildInfo } from "@/lib/api/endpoints";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

function NavLink({
  href,
  active,
  icon: Icon,
  label,
  badge,
  className,
}: {
  href: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("nav-item", active && "nav-item-active", className)}>
      <Icon className="h-4 w-4 shrink-0 opacity-90" />
      <span className="truncate">{label}</span>
      {badge}
    </Link>
  );
}

export function PanelSidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const { bootstrap, premiumLocked } = usePanel();
  const user = bootstrap?.user;
  const isGuest = !user;
  const displayName = user?.global_name || user?.username || "Usuario";
  const brand = resolvePanelBrand(bootstrap?.tenant);
  const homeHref = isGuest ? "/about" : "/dashboard";

  const serverMatch = pathname.match(/^\/server\/([^/]+)/);
  const guildId = serverMatch?.[1] ?? null;
  const serverPaneSlug = guildId ? pathname.split("/")[3] || "overview" : null;
  const settingsPane = pathname.startsWith("/settings") ? pathname.split("/")[2] || "account" : null;

  const [guildName, setGuildName] = useState("Servidor");
  const [guildIcon, setGuildIcon] = useState<string | null>(null);
  const [moduleQuery, setModuleQuery] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const primaryNav = filterPrimaryNav(PRIMARY_NAV, bootstrap?.webConfig);
  const enabledPanes = useMemo(
    () => filterServerPanes(SERVER_PANES, bootstrap?.webConfig),
    [bootstrap?.webConfig]
  );
  const isRealOwner = Boolean(bootstrap?.isRealOwner ?? bootstrap?.isOwner);
  const visibleSettingsNav = filterSettingsNav(
    SETTINGS_NAV.filter((item) => !item.href.includes("/owner") || isRealOwner),
    bootstrap?.webConfig
  );

  useEffect(() => {
    if (!guildId) return;
    void getGuildInfo(guildId)
      .then((info) => {
        if (typeof info.name === "string") setGuildName(info.name);
        if (typeof info.icon === "string") setGuildIcon(info.icon);
      })
      .catch(() => null);
  }, [guildId]);

  const filteredPanes = useMemo(() => {
    const q = moduleQuery.trim().toLowerCase();
    if (!q) return enabledPanes;
    return enabledPanes.filter((item) => item.label.toLowerCase().includes(q));
  }, [enabledPanes, moduleQuery]);

  const groupedServerNav = useMemo(() => {
    const paneBySlug = new Map(filteredPanes.map((p) => [p.slug, p]));
    return SERVER_PANE_GROUPS.map((group) => ({
      ...group,
      items: group.slugs.map((slug) => paneBySlug.get(slug)).filter(Boolean) as typeof filteredPanes,
    })).filter((g) => g.items.length > 0);
  }, [filteredPanes]);

  return (
    <aside
      className={cn(
        "glass-sidebar panel-scroll fixed inset-y-0 left-0 z-50 flex w-[var(--sidebar-width)] flex-col",
        className
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-white/6 px-4 py-4">
        {brand.logoUrl ? (
          <Link href={homeHref} className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.logoUrl} alt="" className="h-9 w-9 rounded-xl object-cover" />
            <span className="truncate font-semibold text-white">{brand.name}</span>
          </Link>
        ) : (
          <Link href={homeHref} className="flex min-w-0 items-center gap-2.5">
            <EyedBotMark className="h-9 w-9 rounded-xl" />
            <span className="truncate font-semibold text-white">EyedBot</span>
          </Link>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {guildId ? (
          <div className="space-y-4">
            <Link
              href="/dashboard"
              className="glass-panel flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/[0.06]"
            >
              {guildIcon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={guildIcon} alt="" className="h-9 w-9 rounded-lg object-cover" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/20 text-violet-200">
                  <Server className="h-4 w-4" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{guildName}</p>
                <p className="truncate text-xs text-zinc-500">Cambiar servidor</p>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
            </Link>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <Input
                value={moduleQuery}
                onChange={(e) => setModuleQuery(e.target.value)}
                placeholder="Buscar módulo…"
                className="h-9 pl-9 text-xs"
                aria-label="Buscar módulo"
              />
            </div>

            {groupedServerNav.length ? (
              groupedServerNav.map((group) => (
                <div key={group.label}>
                  <p className="nav-section-label">{group.label}</p>
                  <div className="mt-1 space-y-0.5">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.id}
                        href={serverPaneHref(guildId, item.slug)}
                        active={serverPaneSlug === item.slug}
                        icon={item.icon}
                        label={item.label}
                        badge={
                          item.premium && premiumLocked ? (
                            <Sparkles className="ml-auto h-3 w-3 text-amber-300/90" />
                          ) : null
                        }
                      />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="px-2 text-sm text-zinc-500">Sin módulos</p>
            )}
          </div>
        ) : settingsPane ? (
          <div className="space-y-1">
            <p className="nav-section-label">Configuración</p>
            {visibleSettingsNav.map((item) => {
              const slug = item.href.split("/").pop() || "account";
              return (
                <NavLink
                  key={item.href}
                  href={item.href}
                  active={settingsPane === slug}
                  icon={item.icon}
                  label={item.label}
                  badge={
                    item.premium && premiumLocked ? (
                      <Sparkles className="ml-auto h-3 w-3 text-amber-300/90" />
                    ) : null
                  }
                />
              );
            })}
          </div>
        ) : (
          <div className="space-y-1">
            <p className="nav-section-label">Principal</p>
            {primaryNav.map((item) => {
              const guestLocked = isGuest && !isPublicPanelRoute(item.href);
              const href = guestLocked ? "/login" : item.href;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <NavLink
                  key={item.href}
                  href={href}
                  active={active}
                  icon={item.icon}
                  label={item.label}
                  className={guestLocked && !active ? "opacity-70" : undefined}
                  badge={
                    item.premium ? (
                      <Sparkles className="ml-auto h-3 w-3 text-amber-300/80" />
                    ) : null
                  }
                />
              );
            })}
            {!isGuest ? (
              <>
                <p className="nav-section-label mt-5">Cuenta</p>
                <NavLink
                  href="/settings/account"
                  active={pathname.startsWith("/settings")}
                  icon={Settings}
                  label="Configuración"
                />
              </>
            ) : null}
          </div>
        )}
      </div>

      <div className="border-t border-white/6 p-3">
        <div className="mb-2 flex flex-col gap-0.5">
          <a
            href="https://discord.gg/eN6eQdGn87"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-item text-xs"
          >
            <ChevronRight className="h-3.5 w-3.5" />
            Soporte Discord
          </a>
          <Link href="/docs" className="nav-item text-xs">
            <BookOpen className="h-3.5 w-3.5" />
            Documentación
          </Link>
          <Link href="/commands" className="nav-item text-xs">
            <Terminal className="h-3.5 w-3.5" />
            Comandos
          </Link>
        </div>

        {isGuest ? (
          <Link
            href="/login"
            className="nav-item justify-center border border-[color:var(--color-accent)]/25 bg-[color:var(--color-accent)]/10 text-[color:var(--color-brand-light)]"
          >
            Iniciar sesión
          </Link>
        ) : (
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex w-full items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.04] px-2.5 py-2 text-left hover:bg-white/[0.07]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={discordAvatarUrl(user.id, user.avatar, 64)}
                alt=""
                className="h-8 w-8 rounded-full"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{displayName}</p>
                <p className="truncate text-xs text-zinc-500">Perfil</p>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
            </button>
            {userMenuOpen ? (
              <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-white/10 bg-[#12101a]/95 shadow-xl backdrop-blur-xl">
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-white/5"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <LayoutDashboard className="h-4 w-4 text-zinc-400" />
                  Dashboard
                </Link>
                <Link
                  href="/settings/account"
                  className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-white/5"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <Settings className="h-4 w-4 text-zinc-400" />
                  Perfil
                </Link>
                <Link
                  href="/settings/theme"
                  className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-white/5"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <Sparkles className="h-4 w-4 text-zinc-400" />
                  Tema
                </Link>
                <a
                  href="/logout"
                  className="flex items-center gap-2 border-t border-white/8 px-3 py-2.5 text-sm text-red-300 hover:bg-red-500/10"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </a>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}
