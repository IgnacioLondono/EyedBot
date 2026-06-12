export type PanelUser = {
  id: string;
  username: string;
  discriminator?: string;
  global_name?: string;
  avatar?: string | null;
};

export type GuildSummary = {
  id: string;
  name: string;
  icon?: string | null;
  owner?: boolean;
  permissions?: string;
  botInGuild?: boolean;
  memberCount?: number;
  botGuild?: {
    memberCount?: number;
  };
};

export type DashboardGuildSummary = {
  id: string;
  name: string;
  icon: string | null;
  banner: string | null;
  memberCount: number;
  channelCount: number;
  roleCount: number;
  premiumTier: number;
  premiumSubscriptionCount: number;
  createdAt: string;
  owner: {
    id: string;
    tag: string;
    avatar: string | null;
  };
  members: {
    humans: number;
    bots: number;
  };
  channels: {
    text: number;
    voice: number;
    category: number;
  };
  activity: {
    trackedUsers: number;
    totalMessages: number;
    totalVoiceMinutes: number;
    joins: number;
    leaves: number;
    net: number;
  };
  modules: {
    welcome: boolean;
    goodbye: boolean;
    verify: boolean;
    tickets: boolean;
    leveling: boolean;
    gacha: boolean;
    freeGames: boolean;
    tempVoice: boolean;
    antiRaid: boolean;
    streamAlerts: boolean;
  };
  economy: {
    profiles: number;
    cards: number;
  } | null;
};

export type DashboardSummary = {
  guilds: DashboardGuildSummary[];
  generatedAt: string;
};

export type PanelBootstrap = {
  user: PanelUser;
  sessionGuilds: GuildSummary[];
  guilds: GuildSummary[];
  inviteUrl: string;
  isOwner: boolean;
  hasPremium?: boolean;
  botConnected: boolean;
  guildsSyncedAt: number;
};

export type BillingStatus = {
  active: boolean;
  status: string;
  grantType?: string | null;
  customerId?: string;
  subscriptionId?: string;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  updatedAt?: string | null;
};

export type AboutOverview = {
  totalServers: number;
  totalCommands: number;
};

export type CommandCatalogItem = {
  name: string;
  description?: string;
  category?: string;
  options?: Array<{ name: string; description?: string; required?: boolean }>;
};

export type ApiError = {
  error: string;
  redirect?: string;
};
