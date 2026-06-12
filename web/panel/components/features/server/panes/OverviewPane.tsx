"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Activity, Server, ShieldCheck, Users } from "lucide-react";
import { getGuildInfo } from "@/lib/api/endpoints";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { PaneGrid, SectionCard } from "@/components/features/shared";
import { asRecord, formatDate, getErrorMessage, toStringValue } from "@/lib/utils";

function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/8 text-zinc-100">
        {icon}
      </div>
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

export function OverviewPane({ guildId }: { guildId: string }) {
  const [info, setInfo] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getGuildInfo(guildId)
      .then((payload) => setInfo(asRecord(payload)))
      .catch((err) => setError(getErrorMessage(err)));
  }, [guildId]);

  if (error) {
    return <Alert title="No se pudo cargar el servidor" description={error} variant="danger" />;
  }

  const entries = Object.entries(info).filter(([, value]) => value !== null && value !== "");

  return (
    <PaneGrid>
      <SectionCard
        title={toStringValue(info.name, "Servidor")}
        description="Vista general del estado del servidor conectado al panel."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Servidor" value={toStringValue(info.name, "Sin nombre")} icon={<Server className="h-5 w-5" />} />
          <StatTile label="Miembros" value={toStringValue(info.memberCount, "N/D")} icon={<Users className="h-5 w-5" />} />
          <StatTile label="Canales" value={toStringValue(info.channelCount, "N/D")} icon={<Activity className="h-5 w-5" />} />
          <StatTile label="Seguridad" value={toStringValue(info.verificationLevel, "N/D")} icon={<ShieldCheck className="h-5 w-5" />} />
        </div>
      </SectionCard>

      <SectionCard title="Detalles" description="Datos recibidos desde `getGuildInfo` para esta comunidad.">
        {entries.length ? (
          <div className="space-y-3">
            {entries.slice(0, 8).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                <span className="text-sm capitalize text-zinc-400">{key}</span>
                <span className="max-w-[55%] truncate text-right text-sm text-white">
                  {key.toLowerCase().includes("at") ? formatDate(value) : toStringValue(value, JSON.stringify(value))}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Sin datos extendidos" description="El endpoint no devolvió detalles adicionales para mostrar." />
        )}
      </SectionCard>
    </PaneGrid>
  );
}
