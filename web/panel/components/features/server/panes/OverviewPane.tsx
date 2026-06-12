"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ChevronRight,
  Hash,
  MessageSquare,
  Mic2,
  RefreshCw,
  Shield,
  TrendingDown,
  TrendingUp,
  Users,
  Volume2,
} from "lucide-react";
import { getGuildInfo } from "@/lib/api/endpoints";
import { serverPaneHref } from "@/lib/navigation";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { LineChart } from "@/components/ui/LineChart";
import { SectionCard } from "@/components/features/shared";
import { asArray, asRecord, formatDate, getErrorMessage, toNumberValue, toStringValue } from "@/lib/utils";

type InsightView = "main" | "members" | "channels" | "roles" | "activity";

function StatTile({
  label,
  value,
  hint,
  icon,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-3xl border border-white/10 bg-white/5 p-4 text-left transition ${
        onClick ? "hover:border-violet-400/40 hover:bg-white/[0.07]" : ""
      }`}
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/8 text-zinc-100">
        {icon}
      </div>
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
      {onClick ? (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-violet-300">
          Ver detalle <ChevronRight className="h-3 w-3" />
        </p>
      ) : null}
    </Comp>
  );
}

function LeaderRow({
  rank,
  name,
  avatar,
  primary,
  secondary,
}: {
  rank: number;
  name: string;
  avatar?: string | null;
  primary: string;
  secondary?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
      <span className="w-6 text-sm font-semibold text-zinc-500">#{rank}</span>
      {avatar ? (
        <img src={avatar} alt="" className="h-9 w-9 rounded-full border border-white/10 object-cover" />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs text-zinc-400">
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{name}</p>
        {secondary ? <p className="truncate text-xs text-zinc-500">{secondary}</p> : null}
      </div>
      <span className="text-sm font-medium text-violet-200">{primary}</span>
    </div>
  );
}

export function OverviewPane({ guildId }: { guildId: string }) {
  const [info, setInfo] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<InsightView>("main");
  const [chartRange, setChartRange] = useState<"7d" | "all">("7d");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const payload = await getGuildInfo(guildId);
      setInfo(asRecord(payload));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [guildId]);

  useEffect(() => {
    void load(false);
    const timer = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const derived = useMemo(() => {
    const owner = asRecord(info.owner);
    const members = asRecord(info.members);
    const channels = asRecord(info.channels);
    const channelItems = asRecord(channels.items);
    const activity = asRecord(info.activity);
    const messages = asRecord(activity.messages);
    const voice = asRecord(activity.voice);
    const liveVoice = asRecord(voice.live);
    const memberFlow = asRecord(activity.memberFlow);
    const timeline = asRecord(activity.timeline);
    const daily = asArray<Record<string, unknown>>(timeline.daily);
    const weekly = asArray<Record<string, unknown>>(timeline.weekly);
    const roles = asArray<Record<string, unknown>>(info.roles);
    return {
      owner,
      members,
      channels,
      channelItems,
      activity,
      messages,
      voice,
      liveVoice,
      memberFlow,
      daily,
      weekly,
      textLeaders: asArray<Record<string, unknown>>(messages.leaders),
      voiceLeaders: asArray<Record<string, unknown>>(voice.leaders),
      peakJoins: asRecord(memberFlow.peakJoinsDay),
      peakLeaves: asRecord(memberFlow.peakLeavesDay),
      roles,
    };
  }, [info]);

  const chartPoints = chartRange === "7d" ? derived.daily : derived.weekly.slice(-30);
  const chartLabels = chartPoints.map((p) => toStringValue(p.date).slice(5));
  const chartSeries = [
    {
      key: "joins",
      label: "Entradas",
      color: "#34d399",
      values: chartPoints.map((p) => toNumberValue(p.joins)),
    },
    {
      key: "leaves",
      label: "Salidas",
      color: "#fb7185",
      values: chartPoints.map((p) => toNumberValue(p.leaves)),
    },
    {
      key: "messages",
      label: "Mensajes",
      color: "#60a5fa",
      values: chartPoints.map((p) => toNumberValue(p.messages)),
    },
  ];

  if (loading && !Object.keys(info).length) {
    return <Alert title="Cargando resumen" description="Obteniendo métricas, actividad y canales del servidor." />;
  }

  if (error && !Object.keys(info).length) {
    return <Alert title="No se pudo cargar el servidor" description={error} variant="danger" />;
  }

  const icon = toStringValue(info.icon);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {view !== "main" ? (
            <Button variant="secondary" size="sm" onClick={() => setView("main")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al resumen
            </Button>
          ) : (
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Módulo resumen</p>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={() => void load(true)} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {view === "main" ? (
        <>
          <SectionCard title={toStringValue(info.name, "Servidor")} description="Análisis en vivo del servidor.">
            <div className="mb-6 flex flex-wrap items-center gap-4 rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(124,77,255,0.22),_rgba(0,0,0,0.15)_58%)] p-5">
              {icon ? (
                <img src={icon} alt="" className="h-16 w-16 rounded-2xl border border-white/10 object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-2xl font-semibold text-white">
                  {toStringValue(info.name, "S").slice(0, 1)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => setView("members")} className="text-left">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Propietario</p>
                  <p className="font-medium text-white">{toStringValue(derived.owner.tag, "Desconocido")}</p>
                </button>
                <p className="mt-2 text-sm text-zinc-400">
                  Creado {formatDate(info.createdAt)} · Boost {toNumberValue(info.premiumTier)} ·{" "}
                  {toNumberValue(info.premiumSubscriptionCount)} boosts
                </p>
              </div>
              <Link href={serverPaneHref(guildId, "tickets")} className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-violet-200 hover:bg-white/5">
                Ir a tickets
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="Miembros"
                value={toStringValue(info.memberCount, "0")}
                hint={`${toNumberValue(derived.members.humans)} humanos · ${toNumberValue(derived.members.bots)} bots`}
                icon={<Users className="h-5 w-5" />}
                onClick={() => setView("members")}
              />
              <StatTile
                label="Canales"
                value={toStringValue(info.channelCount, "0")}
                hint={`${toNumberValue(derived.channels.text)} texto · ${toNumberValue(derived.channels.voice)} voz`}
                icon={<Hash className="h-5 w-5" />}
                onClick={() => setView("channels")}
              />
              <StatTile
                label="Roles"
                value={toStringValue(info.roleCount, "0")}
                hint={`${toNumberValue(derived.activity.trackedUsers)} usuarios rastreados`}
                icon={<Shield className="h-5 w-5" />}
                onClick={() => setView("roles")}
              />
              <StatTile
                label="Actividad"
                value={`${toNumberValue(derived.messages.totalTracked).toLocaleString("es-ES")} msgs`}
                hint={`${toNumberValue(derived.voice.totalMinutes)} min voz`}
                icon={<Activity className="h-5 w-5" />}
                onClick={() => setView("activity")}
              />
            </div>
          </SectionCard>

          <SectionCard title="Estadísticas con líneas" description="Entradas, salidas y mensajes en el tiempo.">
            <div className="mb-4 flex gap-2">
              <Button
                size="sm"
                variant={chartRange === "7d" ? "primary" : "secondary"}
                onClick={() => setChartRange("7d")}
              >
                Últimos 7 días
              </Button>
              <Button
                size="sm"
                variant={chartRange === "all" ? "primary" : "secondary"}
                onClick={() => setChartRange("all")}
              >
                Histórico
              </Button>
            </div>
            {chartPoints.length ? (
              <LineChart labels={chartLabels} series={chartSeries} />
            ) : (
              <EmptyState title="Sin datos de timeline" description="Aún no hay actividad registrada para graficar." />
            )}
          </SectionCard>

          <div className="grid gap-5 xl:grid-cols-2">
            <SectionCard title="Flujo de miembros" description="Balance neto y picos registrados.">
              <div className="grid gap-3 sm:grid-cols-3">
                <StatTile label="Entradas" value={toStringValue(derived.memberFlow.totalJoins, "0")} icon={<TrendingUp className="h-5 w-5" />} />
                <StatTile label="Salidas" value={toStringValue(derived.memberFlow.totalLeaves, "0")} icon={<TrendingDown className="h-5 w-5" />} />
                <StatTile label="Neto" value={toStringValue(derived.memberFlow.net, "0")} icon={<Users className="h-5 w-5" />} />
              </div>
              <p className="mt-4 text-sm text-zinc-400">
                Pico entradas: {toStringValue(derived.peakJoins.count, "0")} ({toStringValue(derived.peakJoins.date, "N/D")}) ·
                Pico salidas: {toStringValue(derived.peakLeaves.count, "0")} ({toStringValue(derived.peakLeaves.date, "N/D")})
              </p>
            </SectionCard>

            <SectionCard title="Voz en vivo" description="Estado actual de canales de voz.">
              <p className="text-2xl font-semibold text-white">{toNumberValue(derived.liveVoice.currentUsers)} conectados</p>
              {asRecord(derived.liveVoice.topChannel).name ? (
                <p className="mt-2 text-sm text-zinc-400">
                  Top: #{toStringValue(asRecord(derived.liveVoice.topChannel).name)} (
                  {toNumberValue(asRecord(derived.liveVoice.topChannel).users)} usuarios)
                </p>
              ) : null}
              <div className="mt-4 space-y-2">
                {asArray<Record<string, unknown>>(derived.liveVoice.channels).slice(0, 5).map((ch) => (
                  <div key={toStringValue(ch.id)} className="flex justify-between rounded-xl border border-white/8 px-3 py-2 text-sm">
                    <span className="text-zinc-200">#{toStringValue(ch.name)}</span>
                    <span className="text-zinc-500">{toNumberValue(ch.userCount)} en vivo</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <SectionCard title="Top chat">
              {derived.textLeaders.length ? (
                <div className="space-y-2">
                  {derived.textLeaders.map((user, index) => (
                    <LeaderRow
                      key={toStringValue(user.id, `t-${index}`)}
                      rank={index + 1}
                      name={toStringValue(user.tag, "Usuario")}
                      avatar={toStringValue(user.avatar) || null}
                      primary={`${toNumberValue(user.messageCount)} msgs`}
                      secondary={`${toNumberValue(user.voiceMinutes)} min voz`}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState title="Sin líderes de chat" description="Todavía no hay mensajes rastreados." />
              )}
            </SectionCard>

            <SectionCard title="Top voz">
              {derived.voiceLeaders.length ? (
                <div className="space-y-2">
                  {derived.voiceLeaders.map((user, index) => (
                    <LeaderRow
                      key={toStringValue(user.id, `v-${index}`)}
                      rank={index + 1}
                      name={toStringValue(user.tag, "Usuario")}
                      avatar={toStringValue(user.avatar) || null}
                      primary={`${toNumberValue(user.voiceMinutes)} min`}
                      secondary={`${toNumberValue(user.messageCount)} msgs`}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState title="Sin líderes de voz" description="Todavía no hay actividad de voz rastreada." />
              )}
            </SectionCard>
          </div>
        </>
      ) : null}

      {view === "members" ? (
        <SectionCard title="Miembros" description="Composición humana y bots del servidor.">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="Total" value={toStringValue(info.memberCount, "0")} icon={<Users className="h-5 w-5" />} />
            <StatTile label="Humanos" value={toStringValue(derived.members.humans, "0")} icon={<Users className="h-5 w-5" />} />
            <StatTile label="Bots" value={toStringValue(derived.members.bots, "0")} icon={<Users className="h-5 w-5" />} />
          </div>
          <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 p-4">
            <p className="text-sm text-zinc-300">Propietario: {toStringValue(derived.owner.tag)}</p>
            <p className="mt-2 text-sm text-zinc-500">Usuarios con XP rastreado: {toNumberValue(derived.activity.trackedUsers)}</p>
          </div>
        </SectionCard>
      ) : null}

      {view === "channels" ? (
        <SectionCard title="Canales" description="Instantánea de texto, voz y categorías.">
          <div className="grid gap-6 md:grid-cols-3">
            {(["text", "voice", "category"] as const).map((kind) => (
              <div key={kind}>
                <h4 className="mb-3 text-sm font-medium capitalize text-white">{kind === "category" ? "Categorías" : kind === "text" ? "Texto" : "Voz"}</h4>
                <div className="space-y-2">
                  {asArray<Record<string, unknown>>(derived.channelItems[kind]).map((ch) => (
                    <div key={toStringValue(ch.id)} className="flex justify-between rounded-xl border border-white/8 px-3 py-2 text-sm">
                      <span className="truncate text-zinc-200">
                        {kind === "voice" ? <Volume2 className="mr-1 inline h-3.5 w-3.5" /> : <Hash className="mr-1 inline h-3.5 w-3.5" />}
                        {toStringValue(ch.name)}
                      </span>
                      {kind === "voice" ? <span className="text-zinc-500">{toNumberValue(ch.userCount)}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {view === "roles" ? (
        <SectionCard title="Roles" description="Lista de roles con miembros asignados.">
          <div className="space-y-4">
            {derived.roles.slice(0, 20).map((role) => (
              <div key={toStringValue(role.id)} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-medium text-white">{toStringValue(role.name)}</p>
                  <span className="text-sm text-zinc-500">{toNumberValue(role.members)} miembros</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {asArray<Record<string, unknown>>(role.users).slice(0, 12).map((user) => (
                    <span key={toStringValue(user.id)} className="inline-flex items-center gap-2 rounded-full border border-white/8 px-2 py-1 text-xs text-zinc-300">
                      {user.avatar ? <img src={toStringValue(user.avatar)} alt="" className="h-5 w-5 rounded-full" /> : null}
                      {toStringValue(user.tag)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {view === "activity" ? (
        <SectionCard title="Actividad detallada" description="Mensajes y voz acumulados por el bot.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
              <div className="mb-2 flex items-center gap-2 text-white"><MessageSquare className="h-4 w-4" /> Mensajes</div>
              <p className="text-2xl font-semibold">{toNumberValue(derived.messages.totalTracked).toLocaleString("es-ES")}</p>
              <p className="text-xs text-zinc-500">~{toNumberValue(derived.messages.avgPerDay)} / día</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
              <div className="mb-2 flex items-center gap-2 text-white"><Mic2 className="h-4 w-4" /> Voz</div>
              <p className="text-2xl font-semibold">{toNumberValue(derived.voice.totalMinutes).toLocaleString("es-ES")} min</p>
              <p className="text-xs text-zinc-500">~{toNumberValue(derived.voice.avgHoursPerDay)} h/día</p>
            </div>
          </div>
          <div className="mt-6">
            <LineChart labels={chartLabels} series={chartSeries} />
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
