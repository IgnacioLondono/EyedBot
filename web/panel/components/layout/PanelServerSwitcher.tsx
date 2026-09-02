"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Search, Server } from "lucide-react";
import { getDashboardSummary } from "@/lib/api/endpoints";
import type { DashboardGuildSummary } from "@/lib/types";
import { serverPaneHref } from "@/lib/navigation";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

type PanelServerSwitcherProps = {
  guildId: string;
  guildName: string;
  guildIcon: string | null;
};

export function PanelServerSwitcher({ guildId, guildName, guildIcon }: PanelServerSwitcherProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [guilds, setGuilds] = useState<DashboardGuildSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void getDashboardSummary(false)
      .then((data) => setGuilds(data.guilds || []))
      .catch(() => setGuilds([]))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guilds;
    return guilds.filter((g) => g.name.toLowerCase().includes(q));
  }, [guilds, query]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="panel-server-chip w-full text-left"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {guildIcon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={guildIcon} alt="" className="h-9 w-9 rounded-md object-cover" />
        ) : (
          <div className="panel-icon-box panel-icon-box-neutral flex h-9 w-9 rounded-md">
            <Server className="h-4 w-4" strokeWidth={1.75} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--foreground)]">{guildName}</p>
          <p className="truncate text-xs text-[var(--theme-text-secondary)]">Cambiar servidor</p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[color:var(--color-icon-muted)] transition",
            open && "rotate-180"
          )}
          strokeWidth={1.75}
        />
      </button>

      {open ? (
        <div className="panel-popover panel-scroll absolute left-0 right-0 z-50 mt-2 max-h-80 overflow-y-auto p-2">
          <div className="relative mb-2">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--color-icon-muted)]"
              strokeWidth={1.75}
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar servidores…"
              className="h-9 pl-9 text-xs"
              autoFocus
            />
          </div>

          {loading ? (
            <p className="panel-muted px-2 py-3 text-sm">Cargando servidores…</p>
          ) : filtered.length ? (
            <ul role="listbox" className="space-y-0.5">
              {filtered.map((guild) => {
                const active = guild.id === guildId;
                return (
                  <li key={guild.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={cn("panel-popover-item gap-2", active && "panel-popover-item-active")}
                      onClick={() => {
                        setOpen(false);
                        if (guild.id !== guildId) {
                          router.push(serverPaneHref(guild.id, "overview"));
                        }
                      }}
                    >
                      {guild.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={guild.icon} alt="" className="h-8 w-8 rounded-md object-cover" />
                      ) : (
                        <div className="panel-icon-box panel-icon-box-neutral flex h-8 w-8 rounded-md">
                          <Server className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </div>
                      )}
                      <span className="truncate">{guild.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="panel-muted px-2 py-3 text-sm">No hay servidores administrables.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
