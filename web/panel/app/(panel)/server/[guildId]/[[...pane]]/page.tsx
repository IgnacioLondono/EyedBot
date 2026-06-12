"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { getGuildInfo } from "@/lib/api/endpoints";
import { SERVER_PANES, serverPaneHref } from "@/lib/navigation";
import { usePanel } from "@/components/providers/PanelProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";

export default function ServerPage() {
  const params = useParams<{ guildId: string; pane?: string[] }>();
  const guildId = params.guildId;
  const paneSlug = params.pane?.[0] || "overview";
  const { hasPremium } = usePanel();
  const [guildName, setGuildName] = useState("Servidor");

  const pane = SERVER_PANES.find((p) => p.slug === paneSlug) ?? SERVER_PANES[0];

  useEffect(() => {
    void getGuildInfo(guildId)
      .then((info) => {
        const name = typeof info.name === "string" ? info.name : null;
        if (name) setGuildName(name);
      })
      .catch(() => null);
  }, [guildId]);

  return (
    <>
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al dashboard
      </Link>

      <PageHeader
        kicker="Servidor"
        title={guildName}
        description={`Módulo: ${pane.label}`}
      />

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="flex flex-row gap-2 overflow-x-auto lg:flex-col">
          {SERVER_PANES.map((item) => {
            const Icon = item.icon;
            const active = item.slug === paneSlug;
            return (
              <Link
                key={item.id}
                href={serverPaneHref(guildId, item.slug)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm whitespace-nowrap ${
                  active ? "bg-violet-600/25 text-white" : "text-zinc-400 hover:bg-white/5"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
                {item.premium && !hasPremium ? (
                  <span className="text-[10px] text-fuchsia-300">+</span>
                ) : null}
              </Link>
            );
          })}
        </aside>

        <Card>
          <p className="text-sm text-zinc-400">
            Vista <strong className="text-white">{pane.label}</strong> para el servidor{" "}
            <code className="text-violet-300">{guildId}</code>. Conecta los formularios usando las
            funciones de <code className="text-violet-300">lib/api/endpoints.ts</code> (p. ej.{" "}
            <code className="text-violet-300">getWelcomeConfig</code>,{" "}
            <code className="text-violet-300">getTicketConfig</code>, etc.).
          </p>
        </Card>
      </div>
    </>
  );
}
