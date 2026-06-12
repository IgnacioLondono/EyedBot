"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Crown, RefreshCw, Search, Server, Star } from "lucide-react";
import { getDashboardSummary } from "@/lib/api/endpoints";
import type { DashboardGuildSummary } from "@/lib/types";
import { usePanel } from "@/components/providers/PanelProvider";
import { useDashboardFavorites } from "@/lib/hooks/useDashboardFavorites";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { serverPaneHref } from "@/lib/navigation";

const MODULE_LABELS: Array<{ key: keyof DashboardGuildSummary["modules"]; label: string }> = [
  { key: "welcome", label: "Bienvenida" },
  { key: "tickets", label: "Tickets" },
  { key: "leveling", label: "Niveles" },
  { key: "gacha", label: "Gacha" },
  { key: "antiRaid", label: "Seguridad" },
  { key: "streamAlerts", label: "Directos" },
];

function GuildDashboardCard({
  guild,
  favorite,
  onToggleFavorite,
}: {
  guild: DashboardGuildSummary;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const activeModules = MODULE_LABELS.filter(({ key }) => guild.modules[key]);
  const moduleSummary = activeModules.length
    ? activeModules.map(({ label }) => label).join(" · ")
    : "Sin módulos activos";

  return (
    <Card className="p-4 shadow-none backdrop-blur-sm transition hover:border-white/15 hover:bg-white/5">
      <div className="flex items-start gap-3">
        {guild.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={guild.icon} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/5 text-zinc-400">
            <Server className="h-5 w-5" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate font-medium text-white">{guild.name}</h2>
              <p className="mt-0.5 text-sm text-zinc-500">
                {guild.memberCount.toLocaleString("es-ES")} miembros
                {guild.owner.tag && guild.owner.tag !== "Desconocido"
                  ? ` · ${guild.owner.tag}`
                  : guild.owner.id
                    ? ` · ···${guild.owner.id.slice(-4)}`
                    : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleFavorite}
              className="shrink-0 rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
              aria-label={favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
            >
              <Star className={`h-4 w-4 ${favorite ? "fill-amber-300 text-amber-300" : ""}`} />
            </button>
          </div>

          <p className="mt-2 truncate text-xs text-zinc-500">{moduleSummary}</p>

          {guild.premiumTier > 0 ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-fuchsia-300/80">
              <Crown className="h-3 w-3" />
              Boost {guild.premiumTier}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex gap-2 border-t border-white/5 pt-4">
        <Link
          href={serverPaneHref(guild.id, "overview")}
          className="flex-1 rounded-lg bg-white/8 py-2 text-center text-sm text-white hover:bg-white/12"
        >
          Resumen
        </Link>
        <Link
          href={serverPaneHref(guild.id)}
          className="flex-1 rounded-lg border border-white/10 py-2 text-center text-sm text-zinc-300 hover:bg-white/5"
        >
          Configurar
        </Link>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { bootstrap, loading, error, refresh, hasPremium } = usePanel();
  const { favorites, toggleFavorite } = useDashboardFavorites(bootstrap?.user?.id);
  const [summaries, setSummaries] = useState<DashboardGuildSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

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
    <>
      <PageHeader
        kicker="Panel"
        title="Tus servidores"
        description="Selecciona un servidor. Las estadísticas detalladas están en el módulo Resumen de cada comunidad."
        actions={
          <div className="flex items-center gap-2">
            {hasPremium ? <Badge variant="premium">EyedPlus+ activo</Badge> : null}
            <button
              type="button"
              onClick={() => void handleRefresh()}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
            >
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>
        }
      />

      <div className="mb-5 max-w-md">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar servidor..."
            className="pl-10"
          />
        </div>
      </div>

      {error ? <Card className="mb-4 border-red-500/30 text-red-200">{error}</Card> : null}
      {summaryError ? <Card className="mb-4 border-amber-500/30 text-amber-100">{summaryError}</Card> : null}

      {busy && !summaries.length ? (
        <Card>Cargando servidores…</Card>
      ) : !filtered.all.length ? (
        <Card>
          <p className="text-zinc-300">{query ? "No hay servidores que coincidan con la búsqueda." : "No hay servidores administrables con el bot."}</p>
          {bootstrap?.inviteUrl ? (
            <a href={bootstrap.inviteUrl} className="mt-3 inline-block text-violet-300 underline">
              Invitar EyedBot
            </a>
          ) : null}
        </Card>
      ) : (
        <div className="space-y-8">
          {filtered.favs.length ? (
            <section>
              <h3 className="mb-3 text-sm text-zinc-500">Favoritos</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.favs.map((guild) => (
                  <GuildDashboardCard
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
            <h3 className="mb-3 text-sm text-zinc-500">
              {filtered.favs.length ? "Otros servidores" : "Servidores"}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.rest.map((guild) => (
                <GuildDashboardCard
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
    </>
  );
}
