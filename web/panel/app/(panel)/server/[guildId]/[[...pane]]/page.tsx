"use client";

import type { ComponentType } from "react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getGuildInfo } from "@/lib/api/endpoints";
import { SERVER_PANES } from "@/lib/navigation";
import { filterServerPanes } from "@/lib/web-config";
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
import { EventsPane } from "@/components/features/server/panes/EventsPane";
import { WeeklySummaryPane } from "@/components/features/server/panes/WeeklySummaryPane";
import { PaymentsPane } from "@/components/features/server/panes/PaymentsPane";

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
  events: EventsPane,
  "weekly-summary": WeeklySummaryPane,
  payments: PaymentsPane,
} satisfies Record<string, ComponentType<{ guildId: string }>>;

type ServerPaneSlug = keyof typeof PANE_COMPONENTS;

export default function ServerPage() {
  const params = useParams<{ guildId: string; pane?: string[] }>();
  const guildId = params.guildId;
  const paneSlug = params.pane?.[0] || "overview";
  const { premiumLocked, bootstrap } = usePanel();
  const enabledPanes = useMemo(
    () => filterServerPanes(SERVER_PANES, bootstrap?.webConfig),
    [bootstrap?.webConfig]
  );

  const pane = enabledPanes.find((p) => p.slug === paneSlug) ?? enabledPanes[0] ?? SERVER_PANES[0];
  const PaneComponent = PANE_COMPONENTS[pane.slug as ServerPaneSlug] ?? OverviewPane;
  const [guildName, setGuildName] = useState("Servidor");
  const [guildIcon, setGuildIcon] = useState<string | null>(null);

  useEffect(() => {
    void getGuildInfo(guildId)
      .then((info) => {
        const name = typeof info.name === "string" ? info.name : null;
        const icon = typeof info.icon === "string" ? info.icon : null;
        if (name) setGuildName(name);
        if (icon) setGuildIcon(icon);
      })
      .catch(() => null);
  }, [guildId]);

  return (
    <div className="w-full space-y-6">
      <div className="glass-panel flex flex-wrap items-center gap-4 rounded-2xl p-4 sm:p-5">
        {guildIcon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={guildIcon} alt="" className="h-14 w-14 rounded-2xl object-cover ring-1 ring-white/10" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 text-xl font-bold text-violet-100 ring-1 ring-violet-400/20">
            {guildName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Servidor</p>
          <h1 className="truncate text-2xl font-bold text-white">{guildName}</h1>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">ID: {guildId}</p>
        </div>
        {pane.premium && premiumLocked ? <Badge variant="premium">Premium</Badge> : null}
      </div>

      <PageHeader
        kicker="Módulo"
        title={pane.label}
        description={`Configura ${pane.label.toLowerCase()} para esta comunidad.`}
      />

      <PaneComponent guildId={guildId} />
    </div>
  );
}
