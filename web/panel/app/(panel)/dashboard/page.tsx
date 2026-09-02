"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Crown, Pin, Plus, RefreshCw, Search, Server, Star } from "lucide-react";
import { getDashboardSummary } from "@/lib/api/endpoints";
import type { DashboardGuildSummary } from "@/lib/types";
import { usePanel } from "@/components/providers/PanelProvider";
import { useDashboardFavorites } from "@/lib/hooks/useDashboardFavorites";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { serverPaneHref } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function ServerListRow({
  guild,
  favorite,
  onToggleFavorite,
}: {
  guild: DashboardGuildSummary;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const activeModules = Object.values(guild.modules).filter(Boolean).length;

  return (
    <div className="server-row group border-b border-[var(--color-border-subtle)] last:border-0">
      <Link href={serverPaneHref(guild.id, "overview")} className="flex min-w-0 flex-1 items-center gap-3">
        {guild.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={guild.icon} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-white/10" />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/20">
            <Server className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium text-[var(--foreground)]">{guild.name}</p>
            {guild.premiumTier > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-fuchsia-500/15 px-1.5 py-0.5 text-[10px] text-fuchsia-200">
                <Crown className="h-3 w-3" />
                Boost {guild.premiumTier}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-[var(--theme-text-secondary)]">
            {guild.memberCount.toLocaleString("es-ES")} miembros · {activeModules} módulos activos
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--theme-text-secondary)] opacity-60 transition group-hover:opacity-100" />
      </Link>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onToggleFavorite();
        }}
        className={cn(
          "ml-2 shrink-0 rounded-lg p-2 transition",
          favorite ? "text-amber-500" : "text-[var(--theme-text-secondary)] hover:bg-black/5 hover:text-[var(--foreground)]"
        )}
        aria-label={favorite ? "Quitar de favoritos" : "Fijar servidor"}
      >
        {favorite ? <Star className="h-4 w-4 fill-current" /> : <Pin className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function DashboardPage() {
  const { bootstrap, loading, error, refresh, hasPremium } = usePanel();
  const { favorites, toggleFavorite } = useDashboardFavorites(bootstrap?.user?.id);
  const [summaries, setSummaries] = useState<DashboardGuildSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showInviteSection, setShowInviteSection] = useState(true);

  async function loadSummary(force = false) {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const data = await getDashboardSummary(force);
      setSummaries(data.guilds);
    } catch {
      setSummaryError("No se pudo cargar el listado de servidores.");
      setSummaries([]);
    } finally {
      setSummaryLoading(false);
    }
  }

  useEffect(() => {
    void loadSummary(false);
  }, []);

  async function handleRefresh() {
    await Promise.all([refresh(true), loadSummary(true)]);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? summaries.filter((g) => g.name.toLowerCase().includes(q)) : summaries;
    const favs = list.filter((g) => favorites.includes(g.id));
    const rest = list.filter((g) => !favorites.includes(g.id));
    return { favs, rest, all: list };
  }, [summaries, query, favorites]);

  const busy = loading || summaryLoading;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-accent)] opacity-80">Panel</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)]">Selecciona un servidor</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--theme-text-secondary)]">
              Elige una comunidad para configurar módulos, alertas y moderación.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasPremium ? <Badge variant="premium">EyedPlus+ activo</Badge> : null}
            <button
              type="button"
              onClick={() => void handleRefresh()}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-strong)] px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--color-surface)]"
            >
              <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
              Actualizar
            </button>
          </div>
        </div>
      </header>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar servidores…"
          className="h-11 pl-10"
        />
      </div>

      {error ? (
        <div className="glass-panel rounded-2xl border-red-500/30 px-4 py-3 text-sm text-red-200">{error}</div>
      ) : null}
      {summaryError ? (
        <div className="glass-panel rounded-2xl border-amber-500/30 px-4 py-3 text-sm text-amber-100">{summaryError}</div>
      ) : null}

      {busy && !summaries.length ? (
        <div className="glass-panel rounded-2xl px-4 py-8 text-center text-zinc-400">Cargando servidores…</div>
      ) : !filtered.all.length ? (
        <div className="glass-panel rounded-2xl px-4 py-8 text-center">
          <p className="text-zinc-300">
            {query ? "No hay servidores que coincidan con la búsqueda." : "No hay servidores administrables con el bot."}
          </p>
          {bootstrap?.inviteUrl ? (
            <a
              href={bootstrap.inviteUrl}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600/25 px-4 py-2 text-sm text-violet-100 hover:bg-violet-600/35"
            >
              <Plus className="h-4 w-4" />
              Invitar EyedBot
            </a>
          ) : null}
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.favs.length ? (
            <section>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--theme-text-secondary)]">Fijados</h2>
              <div className="glass-panel overflow-hidden rounded-2xl">
                {filtered.favs.map((guild) => (
                  <ServerListRow
                    key={guild.id}
                    guild={guild}
                    favorite
                    onToggleFavorite={() => toggleFavorite(guild.id)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--theme-text-secondary)]">
              {filtered.favs.length ? "Todos los servidores" : "Servidores"}
            </h2>
            <div className="glass-panel overflow-hidden rounded-2xl">
              {filtered.rest.map((guild) => (
                <ServerListRow
                  key={guild.id}
                  guild={guild}
                  favorite={false}
                  onToggleFavorite={() => toggleFavorite(guild.id)}
                />
              ))}
            </div>
          </section>
        </div>
      )}

      {bootstrap?.inviteUrl ? (
        <section className="glass-panel rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowInviteSection((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-[var(--foreground)] hover:bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)]"
          >
            <span>Añadir EyedBot a más servidores</span>
            <ChevronRight className={cn("h-4 w-4 transition", showInviteSection && "rotate-90")} />
          </button>
          {showInviteSection ? (
            <div className="border-t border-[color:var(--color-border-subtle)] px-4 py-4">
              <p className="panel-muted text-sm">
                Invita el bot a otro servidor de Discord y vuelve aquí para configurarlo.
              </p>
              <a
                href={bootstrap.inviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[color:var(--color-btn-accent-border)] bg-[color:var(--color-btn-accent-bg)] px-4 py-2 text-sm font-semibold text-[color:var(--color-btn-on-accent)]"
              >
                <Plus className="h-4 w-4" />
                Invitar bot
              </a>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
