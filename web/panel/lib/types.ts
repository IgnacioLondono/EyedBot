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
  isRealOwner?: boolean;
  ownerModeEnabled?: boolean;
  hasPremium?: boolean;
  premiumRequired?: boolean;
  botConnected: boolean;
  guildsSyncedAt: number;
  webConfig?: WebPanelConfig;
};

export type WebPanelConfig = {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  premiumRequired: boolean;
  billingEnabled: boolean;
  pages: {
    dashboard: boolean;
    about: boolean;
    commands: boolean;
    premium: boolean;
  };
  modules: {
    welcome: boolean;
    verify: boolean;
    tickets: boolean;
    levels: boolean;
    voice: boolean;
    automation: boolean;
    gacha: boolean;
    moderation: boolean;
    security: boolean;
    notifications: boolean;
    freeGames: boolean;
    embed: boolean;
    themeCustomization: boolean;
  };
};

export type OwnerWebConfig = {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  allowNewLogins: boolean;
  premiumRequired: boolean | null;
  billingEnabled: boolean;
  pages: WebPanelConfig["pages"];
  modules: WebPanelConfig["modules"];
  updatedAt?: string | null;
  updatedBy?: string | null;
  effective?: {
    premiumRequired: boolean;
    billingEnabled: boolean;
  };
  env?: {
    premiumRequired: boolean;
    billingProvider: string;
  };
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
  provider?: "webpay" | "mercadopago" | "none" | null;
};

export type BillingPlan = {
  configured: boolean;
  provider: "webpay" | "mercadopago" | "none";
  monthlyAmount: number;
  currency: string;
  currencyLabel: string;
  periodDays: number;
  productName: string;
  paymentLabel: string;
};

export type CheckoutSessionResponse = {
  url?: string;
  provider?: string;
};

export type BillingPortalResponse = {
  url?: string;
  ok?: boolean;
  message?: string;
  action?: string;
};

export type AboutOverview = {
  botName: string;
  totalServers: number;
  totalCommands: number;
  purpose: string;
  ping: number | null;
  uptime: number | null;
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
