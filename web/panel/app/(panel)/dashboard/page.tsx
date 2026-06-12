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
import { formatDate } from "@/lib/utils";

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

  return (
    <Card className="overflow-hidden p-0 transition hover:border-violet-500/40 hover:bg-white/[0.06]">
      <div
        className="relative h-20 bg-gradient-to-br from-violet-950/80 to-zinc-950"
        style={
          guild.banner
            ? { backgroundImage: `url(${guild.banner})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] via-[#09090b]/70 to-transparent" />
        <button
          type="button"
          onClick={onToggleFavorite}
          className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/40 p-2 text-zinc-200 hover:bg-black/60"
          aria-label={favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
        >
          <Star className={`h-4 w-4 ${favorite ? "fill-amber-300 text-amber-300" : ""}`} />
        </button>
        {guild.premiumTier > 0 ? (
          <div className="absolute left-3 top-3">
            <Badge variant="premium">
              <Crown className="mr-1 h-3 w-3" />
              Boost {guild.premiumTier}
            </Badge>
          </div>
        ) : null}
      </div>

      <div className="px-5 pb-5 pt-10">
        <div className="-mt-14 mb-4 flex items-end gap-3">
          {guild.icon ? (
            <img src={guild.icon} alt="" className="h-14 w-14 rounded-2xl border-4 border-[#09090b] object-cover shadow-lg" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-[#09090b] bg-violet-600/30 text-violet-100 shadow-lg">
              <Server className="h-6 w-6" />
            </div>
          )}
          <div className="min-w-0 flex-1 pb-1">
            <h2 className="truncate text-lg font-semibold text-white">{guild.name}</h2>
            <p className="text-xs text-zinc-500">
              {guild.memberCount.toLocaleString("es-ES")} miembros · {guild.owner.tag}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {activeModules.length ? (
            activeModules.map(({ key, label }) => (
              <span
                key={key}
                className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200"
              >
                {label}
              </span>
            ))
          ) : (
            <span className="text-xs text-zinc-500">Sin módulos activos</span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={serverPaneHref(guild.id, "overview")}
            className="rounded-xl bg-violet-600/80 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600"
          >
            Ver resumen
          </Link>
          <Link
            href={serverPaneHref(guild.id)}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5"
          >
            Configurar
          </Link>
        </div>

        <p className="mt-3 text-xs text-zinc-600">Creado {formatDate(guild.createdAt)}</p>
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
              <h3 className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Favoritos</h3>
              <div className="grid gap-5 xl:grid-cols-2">
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
            <h3 className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
              {filtered.favs.length ? "Otros servidores" : "Servidores"}
            </h3>
            <div className="grid gap-5 xl:grid-cols-2">
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
