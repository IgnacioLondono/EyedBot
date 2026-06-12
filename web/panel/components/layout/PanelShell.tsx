"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronDown, Eye, LogOut, Plus } from "lucide-react";
import { useState } from "react";
import { PRIMARY_NAV } from "@/lib/navigation";
import { usePanel } from "@/components/providers/PanelProvider";
import { cn } from "@/lib/utils";
import { WallpaperLayer } from "@/components/layout/WallpaperLayer";
import { useThemeSettings } from "@/components/providers/ThemeProvider";

function avatarUrl(user: { id: string; avatar?: string | null }) {
  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
  }
  const index = Number(BigInt(user.id) % BigInt(6));
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export function PanelShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { bootstrap } = usePanel();
  const { hasActiveWallpaper } = useThemeSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const user = bootstrap?.user;
  const displayName = user?.global_name || user?.username || "Usuario";

  return (
    <div className={cn("relative min-h-screen text-zinc-100", !hasActiveWallpaper && "bg-[var(--color-bg)]")}>
      <WallpaperLayer />
      <div className="theme-bubbles pointer-events-none fixed inset-0 z-[1] overflow-hidden opacity-0 transition-opacity">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-[color:var(--color-accent)]/20 blur-3xl" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-[color:var(--color-accent-2)]/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-[color:var(--color-glow)]/10 blur-3xl" />
      </div>

      <nav className="sticky top-0 z-40 border-b border-white/10 bg-black/30 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 lg:px-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-white shadow-[0_0_40px_var(--shadow-accent)]">
              <Eye className="h-5 w-5" />
            </span>
            <span className="hidden sm:inline">EyedBot Panel</span>
          </Link>

          <div className="hidden flex-1 items-center gap-1 md:flex">
            {PRIMARY_NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-2xl px-3 py-2 text-sm transition",
                    active
                      ? "border border-white/10 bg-white/10 text-white"
                      : "text-zinc-400 hover:bg-white/5 hover:text-white",
                    item.premium && "text-fuchsia-200"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <a
              href="https://discord.gg/eN6eQdGn87"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden rounded-2xl border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 sm:inline-flex"
            >
              Discord
            </a>
            {bootstrap?.inviteUrl ? (
              <a
                href={bootstrap.inviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-2xl bg-[linear-gradient(135deg,var(--color-accent),var(--color-accent-2))] px-3 py-2 text-sm font-medium text-white shadow-[0_10px_35px_var(--shadow-accent)]"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Añadir bot</span>
              </a>
            ) : null}

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-2 py-1.5 hover:bg-white/8"
              >
                {user ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl(user)} alt="" className="h-8 w-8 rounded-full" />
                ) : (
                  <span className="h-8 w-8 rounded-full bg-zinc-800" />
                )}
                <span className="hidden max-w-[8rem] truncate text-sm sm:inline">{displayName}</span>
                <ChevronDown className="h-4 w-4 text-zinc-500" />
              </button>
              {menuOpen ? (
                <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-white/10 bg-[#12101a]/95 p-1 shadow-xl backdrop-blur-xl">
                  <Link
                    href="/settings/account"
                    className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5"
                    onClick={() => setMenuOpen(false)}
                  >
                    Configuración
                  </Link>
                  <a
                    href="/logout"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
                  >
                    <LogOut className="h-4 w-4" />
                    Cerrar sesión
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </nav>

      <motion.main
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative z-10 mx-auto w-full max-w-[90rem] px-4 py-6 pb-24 lg:px-8 lg:pb-8"
      >
        {children}
      </motion.main>

      <div className="fixed inset-x-3 bottom-3 z-40 md:hidden">
        <div className="grid grid-cols-4 rounded-[28px] border border-white/10 bg-black/40 p-2 shadow-2xl backdrop-blur-2xl">
          {PRIMARY_NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] text-zinc-400 transition",
                  active && "bg-white/10 text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
