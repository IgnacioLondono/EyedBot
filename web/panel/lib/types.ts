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
};

export type PanelBootstrap = {
  user: PanelUser;
  sessionGuilds: GuildSummary[];
  guilds: GuildSummary[];
  inviteUrl: string;
  isOwner: boolean;
  botConnected: boolean;
  guildsSyncedAt: number;
};

export type BillingStatus = {
  active: boolean;
  status: string;
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
