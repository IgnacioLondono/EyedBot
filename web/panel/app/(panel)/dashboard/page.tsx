"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity,
  Crown,
  MessageSquare,
  Mic,
  RefreshCw,
  Server,
  Shield,
  Users,
} from "lucide-react";
import { getDashboardSummary } from "@/lib/api/endpoints";
import type { DashboardGuildSummary } from "@/lib/types";
import { usePanel } from "@/components/providers/PanelProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { serverPaneHref } from "@/lib/navigation";
import { formatDate } from "@/lib/utils";

const MODULE_LABELS: Array<{ key: keyof DashboardGuildSummary["modules"]; label: string }> = [
  { key: "welcome", label: "Bienvenida" },
  { key: "goodbye", label: "Despedida" },
  { key: "verify", label: "Verificación" },
  { key: "tickets", label: "Tickets" },
  { key: "leveling", label: "Niveles" },
  { key: "gacha", label: "Gacha" },
  { key: "freeGames", label: "Free games" },
  { key: "tempVoice", label: "Voz temp." },
  { key: "antiRaid", label: "Anti-raid" },
  { key: "streamAlerts", label: "Directos" },
];

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function GuildDashboardCard({ guild }: { guild: DashboardGuildSummary }) {
  const activeModules = MODULE_LABELS.filter(({ key }) => guild.modules[key]);

  return (
    <Link href={serverPaneHref(guild.id)}>
      <Card className="overflow-hidden p-0 transition hover:border-violet-500/40 hover:bg-white/[0.06]">
        <div
          className="relative h-24 bg-gradient-to-br from-violet-950/80 to-zinc-950"
          style={
            guild.banner
              ? { backgroundImage: `url(${guild.banner})`, backgroundSize: "cover", backgroundPosition: "center" }
              : undefined
          }
        >
          <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] via-[#09090b]/70 to-transparent" />
          <div className="absolute bottom-0 left-4 flex translate-y-1/2 items-end gap-3">
            {guild.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={guild.icon}
                alt=""
                className="h-16 w-16 rounded-2xl border-4 border-[#09090b] bg-[#09090b] object-cover shadow-lg"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-[#09090b] bg-violet-600/30 text-violet-100 shadow-lg">
                <Server className="h-7 w-7" />
              </div>
            )}
          </div>
          {guild.premiumTier > 0 ? (
            <div className="absolute right-3 top-3">
              <Badge variant="premium">
                <Crown className="mr-1 h-3 w-3" />
                Boost {guild.premiumTier}
              </Badge>
            </div>
          ) : null}
        </div>

        <div className="px-5 pb-5 pt-12">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-white">{guild.name}</h2>
              <p className="text-xs text-zinc-500">
                ID ···{guild.id.slice(-4)} · Creado {formatDate(guild.createdAt)}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatPill label="Miembros" value={guild.memberCount.toLocaleString("es-ES")} />
            <StatPill label="Humanos" value={guild.members.humans.toLocaleString("es-ES")} />
            <StatPill label="Bots" value={guild.members.bots.toLocaleString("es-ES")} />
            <StatPill label="Canales" value={guild.channelCount} />
            <StatPill label="Roles" value={guild.roleCount} />
            <StatPill label="Seguidos" value={guild.activity.trackedUsers} />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <StatPill label="Mensajes" value={guild.activity.totalMessages.toLocaleString("es-ES")} />
            <StatPill label="Voz (min)" value={guild.activity.totalVoiceMinutes.toLocaleString("es-ES")} />
            <StatPill
              label="Flujo neto"
              value={`${guild.activity.net >= 0 ? "+" : ""}${guild.activity.net}`}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {guild.owner.tag}
            </span>
            <span>·</span>
            <span>
              {guild.channels.text} texto · {guild.channels.voice} voz · {guild.channels.category} cat.
            </span>
          </div>

          {guild.economy ? (
            <p className="mt-3 text-xs text-zinc-500">
              Economía: {guild.economy.profiles} perfiles · {guild.economy.cards} cartas
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-1.5">
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
              <span className="text-xs text-zinc-500">Sin módulos activos en base de datos</span>
            )}
          </div>

          <div className="mt-4 flex items-center gap-4 text-xs text-violet-300">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              Entradas {guild.activity.joins}
            </span>
            <span className="inline-flex items-center gap-1">
              <Activity className="h-3.5 w-3.5" />
              Salidas {guild.activity.leaves}
            </span>
            <span className="inline-flex items-center gap-1">
              <Mic className="h-3.5 w-3.5" />
              {guild.activity.totalVoiceMinutes} min
            </span>
            <span className="inline-flex items-center gap-1">
              <Shield className="h-3.5 w-3.5" />
              Ver resumen
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const { bootstrap, loading, error, refresh, hasPremium } = usePanel();
  const [summaries, setSummaries] = useState<DashboardGuildSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  async function loadSummary(force = false) {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const data = await getDashboardSummary(force);
      setSummaries(data.guilds);
    } catch {
      setSummaryError("No se pudo cargar el resumen de servidores.");
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

  const guildCount = summaries.length || bootstrap?.guilds?.length || 0;
  const busy = loading || summaryLoading;

  return (
    <>
      <PageHeader
        kicker="Panel"
        title="Tus servidores"
        description="Resumen completo con iconos, actividad de base de datos y módulos activos por comunidad."
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

      {error ? <Card className="mb-4 border-red-500/30 text-red-200">{error}</Card> : null}
      {summaryError ? <Card className="mb-4 border-amber-500/30 text-amber-100">{summaryError}</Card> : null}

      {busy && !summaries.length ? (
        <Card>Cargando resumen de servidores…</Card>
      ) : !guildCount ? (
        <Card>
          <p className="text-zinc-300">No hay servidores administrables con el bot.</p>
          {bootstrap?.inviteUrl ? (
            <a href={bootstrap.inviteUrl} className="mt-3 inline-block text-violet-300 underline">
              Invitar EyedBot
            </a>
          ) : null}
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {summaries.map((guild) => (
            <GuildDashboardCard key={guild.id} guild={guild} />
          ))}
        </div>
      )}
    </>
  );
}
