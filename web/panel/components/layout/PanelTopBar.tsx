"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Crown, LogIn, Plus } from "lucide-react";
import { useState } from "react";
import { EyedBotLogo } from "@/components/brand/EyedBotLogo";
import { PRIMARY_NAV } from "@/lib/navigation";
import { filterPrimaryNav } from "@/lib/web-config";
import { EYEDBIO_URL } from "@/lib/eyedbio";
import { usePanel } from "@/components/providers/PanelProvider";
import { discordAvatarUrl } from "@/lib/discord-media";
import { isPublicPanelRoute } from "@/lib/public-routes";
import { cn } from "@/lib/utils";
import { resolvePanelBrand } from "@/lib/brand";
import { PanelTenantSwitcher } from "@/components/layout/PanelTenantSwitcher";

export function PanelTopBar() {
  const pathname = usePathname();
  const { bootstrap } = usePanel();
  const user = bootstrap?.user;
  const isGuest = !user;
  const homeHref = isGuest ? "/about" : "/dashboard";
  const brand = resolvePanelBrand(bootstrap?.tenant);
  const brandLabel = brand.isTenant ? brand.name : "EyedBot";
  const displayName = user?.global_name || user?.username || "Usuario";
  const primaryNav = filterPrimaryNav(PRIMARY_NAV, bootstrap?.webConfig);
  const [userOpen, setUserOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-40 hidden border-b border-white/[0.06] bg-[#0a0a0c]/92 backdrop-blur-xl lg:block">
      <div className="flex h-14 items-center justify-between gap-4 px-6 xl:px-8">
        <div className="flex min-w-0 items-center gap-6">
          {brand.logoUrl ? (
            <Link href={homeHref} className="flex shrink-0 items-center gap-2 font-semibold text-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={brand.logoUrl} alt="" className="h-8 w-8 rounded-xl object-cover" />
              <span className="hidden xl:inline">{brandLabel}</span>
            </Link>
          ) : (
            <EyedBotLogo href={homeHref} label={brandLabel} showText="desktop" className="shrink-0 font-semibold" />
          )}

        <nav className="flex items-center gap-1">
          {primaryNav.map((item) => {
            const guestLocked = isGuest && !isPublicPanelRoute(item.href);
            const href = guestLocked ? "/login" : item.href;
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
            const isPremium = item.premium;

            return (
              <Link
                key={item.href}
                href={href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm transition",
                  active
                    ? "bg-white/[0.06] text-white"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
                  isPremium && !active && "text-amber-200/90",
                  guestLocked && !active && "opacity-70"
                )}
              >
                {item.label}
              </Link>
            );
          })}

          <div className="relative">
            <button
              type="button"
              onClick={() => setResourcesOpen((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200",
                (pathname === "/about" || pathname.startsWith("/docs")) && "bg-white/[0.06] text-white"
              )}
            >
              Recursos
              <ChevronDown className={cn("h-4 w-4 transition", resourcesOpen && "rotate-180")} />
            </button>
            {resourcesOpen ? (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-xl border border-white/10 bg-[#141418] p-1.5 shadow-2xl">
                <Link
                  href="/docs"
                  className="block rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
                  onClick={() => setResourcesOpen(false)}
                >
                  Documentación
                </Link>
                <Link
                  href="/about"
                  className="block rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
                  onClick={() => setResourcesOpen(false)}
                >
                  Acerca de
                </Link>
                <Link
                  href="/commands"
                  className="block rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
                  onClick={() => setResourcesOpen(false)}
                >
                  Comandos
                </Link>
                <a
                  href={EYEDBIO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg px-3 py-2 text-sm text-cyan-300/90 hover:bg-white/5"
                >
                  Eyed.bio
                </a>
              </div>
            ) : null}
          </div>
        </nav>
        </div>

        <div className="flex items-center gap-2">
          {!isGuest ? <PanelTenantSwitcher /> : null}
          <a
            href="https://discord.gg/eN6eQdGn87"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
          >
            Comunidad
          </a>
          <Link
            href="/premium"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-amber-200/95 hover:bg-amber-500/10"
          >
            <Crown className="h-4 w-4" />
            EyedPlus+
          </Link>
          {bootstrap?.inviteUrl ? (
            <a
              href={bootstrap.inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/12 px-3 py-2 text-sm font-medium text-violet-100 hover:bg-[color:var(--color-accent)]/20"
            >
              <Plus className="h-4 w-4" />
              Añadir bot
            </a>
          ) : null}

          {isGuest ? (
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white"
            >
              <LogIn className="h-4 w-4" />
              Iniciar sesión
            </Link>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] py-1.5 pl-1.5 pr-2.5 hover:bg-white/[0.06]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={discordAvatarUrl(user.id, user.avatar, 64)} alt="" className="h-7 w-7 rounded-full" />
                <span className="max-w-[7rem] truncate text-sm text-zinc-200">{displayName}</span>
                <ChevronDown className="h-4 w-4 text-zinc-500" />
              </button>
              {userOpen ? (
                <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-white/10 bg-[#141418] shadow-2xl">
                  <Link href="/dashboard" className="block px-3 py-2.5 text-sm hover:bg-white/5" onClick={() => setUserOpen(false)}>
                    Dashboard
                  </Link>
                  <Link href="/settings/account" className="block px-3 py-2.5 text-sm hover:bg-white/5" onClick={() => setUserOpen(false)}>
                    Perfil
                  </Link>
                  <Link href="/settings/theme" className="block px-3 py-2.5 text-sm hover:bg-white/5" onClick={() => setUserOpen(false)}>
                    Tema
                  </Link>
                  <a href="/logout" className="block border-t border-white/8 px-3 py-2.5 text-sm text-red-300 hover:bg-red-500/10">
                    Cerrar sesión
                  </a>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
