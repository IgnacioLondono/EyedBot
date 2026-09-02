"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, Monitor, Moon, MoreHorizontal, Sun, User } from "lucide-react";
import { discordAvatarUrl } from "@/lib/discord-media";
import {
  applyPanelColorMode,
  persistPanelColorMode,
  readPanelColorMode,
  type PanelColorMode,
} from "@/lib/color-mode";
import { cn } from "@/lib/utils";

export function PanelSidebarUserCard({
  user,
  displayName,
}: {
  user?: { id: string; avatar?: string | null; username: string; global_name?: string | null };
  displayName: string;
}) {
  const [open, setOpen] = useState(false);
  const [colorMode, setColorMode] = useState<PanelColorMode>("dark");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mode = readPanelColorMode();
    setColorMode(mode);
    applyPanelColorMode(mode);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (colorMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyPanelColorMode("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [colorMode]);

  function selectColorMode(mode: PanelColorMode) {
    setColorMode(mode);
    persistPanelColorMode(mode);
    applyPanelColorMode(mode);
  }

  if (!user) {
    return (
      <Link href="/login" className="sidebar-user-card sidebar-user-card-guest">
        Iniciar sesión
      </Link>
    );
  }

  return (
    <div className="relative" ref={rootRef}>
      {open ? (
        <div className="sidebar-user-popover">
          <Link
            href="/settings/account"
            className="sidebar-user-popover-item"
            onClick={() => setOpen(false)}
          >
            <User className="h-4 w-4 text-zinc-400" />
            Perfil
          </Link>

          <div className="px-3 py-2">
            <p className="mb-2 text-xs text-zinc-500">Tema</p>
            <div className="sidebar-theme-toggle" role="group" aria-label="Tema del panel">
              {(
                [
                  { id: "light" as const, icon: Sun, label: "Claro" },
                  { id: "dark" as const, icon: Moon, label: "Oscuro" },
                  { id: "system" as const, icon: Monitor, label: "Sistema" },
                ] as const
              ).map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={colorMode === id}
                  onClick={() => selectColorMode(id)}
                  className={cn("sidebar-theme-toggle-btn", colorMode === id && "sidebar-theme-toggle-btn-active")}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-white/[0.06]" />

          <a href="/logout" className="sidebar-user-popover-signout">
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </a>

          <div className="sidebar-user-popover-caret" aria-hidden />
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn("sidebar-user-card", open && "sidebar-user-card-open")}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={discordAvatarUrl(user.id, user.avatar, 64)} alt="" className="h-8 w-8 rounded-full" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{displayName}</span>
        <MoreHorizontal className="h-4 w-4 shrink-0 text-zinc-500" />
      </button>
    </div>
  );
}
