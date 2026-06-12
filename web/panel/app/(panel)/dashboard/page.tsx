"use client";

import Link from "next/link";
import { RefreshCw, Server } from "lucide-react";
import { usePanel } from "@/components/providers/PanelProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { serverPaneHref } from "@/lib/navigation";

export default function DashboardPage() {
  const { bootstrap, loading, error, refresh } = usePanel();
  const guilds = bootstrap?.guilds ?? [];

  return (
    <>
      <PageHeader
        kicker="Panel"
        title="Tus servidores"
        description="Selecciona un servidor para configurar módulos, moderación, tickets y más."
        actions={
          <button
            type="button"
            onClick={() => void refresh(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        }
      />

      {error ? (
        <Card className="border-red-500/30 text-red-200">{error}</Card>
      ) : loading && !guilds.length ? (
        <Card>Cargando servidores…</Card>
      ) : !guilds.length ? (
        <Card>
          <p className="text-zinc-300">No hay servidores administrables con el bot.</p>
          {bootstrap?.inviteUrl ? (
            <a href={bootstrap.inviteUrl} className="mt-3 inline-block text-violet-300 underline">
              Invitar EyedBot
            </a>
          ) : null}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {guilds.map((guild) => (
            <Link key={guild.id} href={serverPaneHref(guild.id)}>
              <Card className="transition hover:border-violet-500/40 hover:bg-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600/20 text-violet-200">
                    <Server className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-white">{guild.name}</h2>
                    <p className="text-xs text-zinc-500">
                      {guild.memberCount ? `${guild.memberCount} miembros` : "Servidor"}
                      {guild.botInGuild === false ? " · Sin bot" : ""}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
