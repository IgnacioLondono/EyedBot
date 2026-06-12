"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronDown, Eye, LogOut, Plus } from "lucide-react";
import { useState } from "react";
import { PRIMARY_NAV } from "@/lib/navigation";
import { usePanel } from "@/components/providers/PanelProvider";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const user = bootstrap?.user;
  const displayName = user?.global_name || user?.username || "Usuario";

  return (
    <div className="min-h-screen bg-[#07060d] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-fuchsia-600/15 blur-3xl" />
      </div>

      <nav className="sticky top-0 z-40 border-b border-white/10 bg-[#07060d]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 lg:px-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600/30 text-violet-200">
              <Eye className="h-5 w-5" />
            </span>
            <span>EyedBot</span>
          </Link>

          <div className="hidden flex-1 items-center gap-1 md:flex">
            {PRIMARY_NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                    active
                      ? "bg-violet-600/25 text-white"
                      : "text-zinc-400 hover:bg-white/5 hover:text-white"
                  } ${item.premium ? "text-fuchsia-200" : ""}`}
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
              className="hidden rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 sm:inline-flex"
            >
              Discord
            </a>
            {bootstrap?.inviteUrl ? (
              <a
                href={bootstrap.inviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-xl bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Añadir bot</span>
              </a>
            ) : null}

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-xl border border-white/10 px-2 py-1.5 hover:bg-white/5"
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
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-white/10 bg-[#12101a] p-1 shadow-xl">
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
        className="relative mx-auto max-w-7xl px-4 py-8 lg:px-6"
      >
        {children}
      </motion.main>
    </div>
  );
}
