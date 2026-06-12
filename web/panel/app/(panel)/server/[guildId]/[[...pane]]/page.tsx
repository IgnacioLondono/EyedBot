"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { getGuildInfo } from "@/lib/api/endpoints";
import { SERVER_PANES, serverPaneHref } from "@/lib/navigation";
import { usePanel } from "@/components/providers/PanelProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { OverviewPane } from "@/components/features/server/panes/OverviewPane";
import { WelcomePane } from "@/components/features/server/panes/WelcomePane";
import { VerifyPane } from "@/components/features/server/panes/VerifyPane";
import { TicketsPane } from "@/components/features/server/panes/TicketsPane";
import { LevelsPane } from "@/components/features/server/panes/LevelsPane";
import { VoicePane } from "@/components/features/server/panes/VoicePane";
import { AutomationPane } from "@/components/features/server/panes/AutomationPane";
import { GachaPane } from "@/components/features/server/panes/GachaPane";
import { ModerationPane } from "@/components/features/server/panes/ModerationPane";
import { NotificationsPane } from "@/components/features/server/panes/NotificationsPane";
import { FreeGamesPane } from "@/components/features/server/panes/FreeGamesPane";
import { SecurityPane } from "@/components/features/server/panes/SecurityPane";
import { EmbedPane } from "@/components/features/server/panes/EmbedPane";
import { ModuleContent, ModuleSidebar } from "@/components/features/shared";

const PANE_COMPONENTS = {
  overview: OverviewPane,
  welcome: WelcomePane,
  verify: VerifyPane,
  tickets: TicketsPane,
  levels: LevelsPane,
  voice: VoicePane,
  automation: AutomationPane,
  gacha: GachaPane,
  moderation: ModerationPane,
  security: SecurityPane,
  notifications: NotificationsPane,
  "free-games": FreeGamesPane,
  embed: EmbedPane,
} satisfies Record<string, ComponentType<{ guildId: string }>>;

type ServerPaneSlug = keyof typeof PANE_COMPONENTS;

export default function ServerPage() {
  const params = useParams<{ guildId: string; pane?: string[] }>();
  const guildId = params.guildId;
  const paneSlug = params.pane?.[0] || "overview";
  const { hasPremium } = usePanel();
  const [guildName, setGuildName] = useState("Servidor");
  const [moduleQuery, setModuleQuery] = useState("");

  const pane = SERVER_PANES.find((p) => p.slug === paneSlug) ?? SERVER_PANES[0];
  const PaneComponent = PANE_COMPONENTS[pane.slug as ServerPaneSlug] ?? OverviewPane;

  const filteredPanes = useMemo(() => {
    const q = moduleQuery.trim().toLowerCase();
    if (!q) return SERVER_PANES;
    return SERVER_PANES.filter((item) => item.label.toLowerCase().includes(q));
  }, [moduleQuery]);

  useEffect(() => {
    void getGuildInfo(guildId)
      .then((info) => {
        const name = typeof info.name === "string" ? info.name : null;
        if (name) setGuildName(name);
      })
      .catch(() => null);
  }, [guildId]);

  return (
    <div className="w-full">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al dashboard
      </Link>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6 xl:gap-8">
        <ModuleSidebar
          search={
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                value={moduleQuery}
                onChange={(event) => setModuleQuery(event.target.value)}
                placeholder="Buscar módulo…"
                className="h-10 w-full pl-9 text-sm"
                aria-label="Buscar módulo"
              />
            </div>
          }
        >
          {filteredPanes.length ? (
            filteredPanes.map((item) => {
              const Icon = item.icon;
              const active = item.slug === paneSlug;
              return (
                <Link
                  key={item.id}
                  href={serverPaneHref(guildId, item.slug)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm whitespace-nowrap ${
                    active ? "bg-violet-600/25 text-white" : "text-zinc-400 hover:bg-white/5"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {item.premium && !hasPremium ? (
                    <span className="text-[10px] text-fuchsia-300">+</span>
                  ) : null}
                </Link>
              );
            })
          ) : (
            <p className="px-2 py-2 text-sm text-zinc-500">Sin resultados</p>
          )}
        </ModuleSidebar>

        <ModuleContent>
          <PageHeader
            kicker="Servidor"
            title={guildName}
            description={`Módulo: ${pane.label}`}
            actions={pane.premium && !hasPremium ? <Badge variant="premium">Premium</Badge> : null}
          />
          <div className="mt-5">
            <PaneComponent guildId={guildId} />
          </div>
        </ModuleContent>
      </div>
    </div>
  );
}
