"use client";

import { useEffect, useState } from "react";
import { Activity, Clock3, Shield } from "lucide-react";
import { getLoginRegistry, getLogs, getStats } from "@/lib/api/endpoints";
import { Alert } from "@/components/ui/Alert";
import { PaneGrid, SectionCard } from "@/components/features/shared";
import { asArray, asRecord, formatDate, getErrorMessage, toStringValue } from "@/lib/utils";

export function OwnerSettings() {
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [registry, setRegistry] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getStats(), getLogs({ limit: 6 }), getLoginRegistry()])
      .then(([statsData, logsData, registryData]) => {
        if (!active) return;
        setStats(asRecord(statsData));
        setLogs(asArray(logsData).map((entry) => asRecord(entry)));
        const registryRecord = asRecord(registryData);
        setRegistry(
          asArray(registryRecord.items || registryRecord.logins || registryData).map((entry) =>
            asRecord(entry)
          )
        );
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) return <Alert title="Cargando control owner" description="Consultando estadísticas, logs y registro de accesos." />;
  if (error) return <Alert title="No se pudo cargar owner settings" description={error} variant="danger" />;

  return (
    <PaneGrid>
      <SectionCard title="Estadísticas globales" description="Indicadores principales del backend y del panel.">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Servidores", value: toStringValue(stats.guilds || stats.totalGuilds, "N/D"), icon: <Shield className="h-5 w-5" /> },
            { label: "Usuarios", value: toStringValue(stats.users || stats.totalUsers, "N/D"), icon: <Activity className="h-5 w-5" /> },
            { label: "Eventos", value: toStringValue(stats.events || stats.requests, "N/D"), icon: <Clock3 className="h-5 w-5" /> },
          ].map((item) => (
            <div key={item.label} className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8 text-white">{item.icon}</div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Logs recientes" description="Eventos recientes del sistema expuestos por la API.">
        <div className="space-y-3">
          {logs.slice(0, 6).map((log, index) => (
            <div key={`${log.id ?? index}`} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <p className="text-sm text-white">{toStringValue(log.message || log.event || log.level, "Evento")}</p>
              <p className="mt-1 text-xs text-zinc-500">{formatDate(log.createdAt || log.timestamp)}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Registro de inicio de sesión" description="Últimos accesos administrativos al panel.">
        <div className="space-y-3">
          {registry.slice(0, 8).map((entry, index) => (
            <div key={`${entry.id ?? index}`} className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <span className="text-sm text-white">{toStringValue(entry.username || entry.user || entry.userId, "Usuario")}</span>
              <span className="text-xs text-zinc-500">{formatDate(entry.createdAt || entry.loggedAt || entry.timestamp)}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </PaneGrid>
  );
}
