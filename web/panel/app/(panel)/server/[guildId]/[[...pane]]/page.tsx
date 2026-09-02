"use client";

import type { ComponentType } from "react";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { SERVER_PANES } from "@/lib/navigation";
import { filterServerPanes } from "@/lib/web-config";
import { usePanel } from "@/components/providers/PanelProvider";
import { PageHeader } from "@/components/ui/PageHeader";
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
  const { bootstrap } = usePanel();
  const enabledPanes = useMemo(
    () => filterServerPanes(SERVER_PANES, bootstrap?.webConfig),
    [bootstrap?.webConfig]
  );

  const pane = enabledPanes.find((p) => p.slug === paneSlug) ?? enabledPanes[0] ?? SERVER_PANES[0];
  const PaneComponent = PANE_COMPONENTS[pane.slug as ServerPaneSlug] ?? OverviewPane;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        kicker="Módulo"
        title={pane.label}
        description={`Configura ${pane.label.toLowerCase()} para esta comunidad.`}
      />

      <PaneComponent guildId={guildId} />
    </div>
  );
}
