"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { getGuildInfo } from "@/lib/api/endpoints";
import { SERVER_PANES, serverPaneHref } from "@/lib/navigation";
import { usePanel } from "@/components/providers/PanelProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
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
import { ModuleContent, ModuleNav } from "@/components/features/shared";

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

  const pane = SERVER_PANES.find((p) => p.slug === paneSlug) ?? SERVER_PANES[0];
  const PaneComponent = PANE_COMPONENTS[pane.slug as ServerPaneSlug] ?? OverviewPane;

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
        actions={pane.premium && !hasPremium ? <Badge variant="premium">Premium</Badge> : null}
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <ModuleNav>
          {SERVER_PANES.map((item) => {
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
                {item.label}
                {item.premium && !hasPremium ? (
                  <span className="text-[10px] text-fuchsia-300">+</span>
                ) : null}
              </Link>
            );
          })}
        </ModuleNav>

        <ModuleContent>
          <PaneComponent guildId={guildId} />
        </ModuleContent>
      </div>
    </>
  );
}
