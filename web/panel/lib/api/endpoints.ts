import { apiFetch, apiForm } from "@/lib/api/client";
import type {
  AboutOverview,
  BillingPlan,
  BillingPortalResponse,
  BillingStatus,
  CheckoutSessionResponse,
  CommandCatalogItem,
  DashboardSummary,
  GuildSummary,
  OwnerWebConfig,
  PanelBootstrap,
  PanelUser,
} from "@/lib/types";

const g = (guildId: string) => encodeURIComponent(guildId);

// ─── Sesión y panel ───────────────────────────────────────────────

export const getUser = () => apiFetch<{ user: PanelUser }>("/api/user");

export const getPanelBootstrap = (refresh = false) =>
  apiFetch<PanelBootstrap>(`/api/panel/bootstrap${refresh ? "?refresh=1" : ""}`);

export const getDashboardSummary = (refresh = false) =>
  apiFetch<DashboardSummary>(`/api/panel/dashboard-summary${refresh ? "?refresh=1" : ""}`);

export const getGuilds = () => apiFetch<GuildSummary[]>("/api/guilds");

export const getAboutOverview = () => apiFetch<AboutOverview>("/api/about-overview");

export const getCommands = () => apiFetch<CommandCatalogItem[]>("/api/commands");

export const getStats = () => apiFetch<Record<string, unknown>>("/api/stats");

export const getLogs = (params?: { level?: string; limit?: number }) => {
  const q = new URLSearchParams();
  if (params?.level) q.set("level", params.level);
  if (params?.limit) q.set("limit", String(params.limit));
  const suffix = q.toString() ? `?${q}` : "";
  return apiFetch<unknown[]>(`/api/logs${suffix}`);
};

// ─── Billing ────────────────────────────────────────────────────────

export const getBillingStatus = () => apiFetch<BillingStatus>("/api/billing/status");

export const getBillingPlan = () => apiFetch<BillingPlan>("/api/billing/plan");

export const createCheckoutSession = () =>
  apiFetch<CheckoutSessionResponse>("/api/billing/checkout-session", { method: "POST" });

export const createBillingPortal = () =>
  apiFetch<BillingPortalResponse>("/api/billing/portal", { method: "POST" });

// ─── Admin (owner) ──────────────────────────────────────────────────

export const getLoginRegistry = () => apiFetch<unknown>("/api/admin/login-registry");

export const getOwnerWebConfig = () => apiFetch<OwnerWebConfig>("/api/admin/web-config");

export const updateOwnerWebConfig = (body: Record<string, unknown>) =>
  apiFetch<OwnerWebConfig>("/api/admin/web-config", { method: "PUT", body });

export const getOwnerPanelMode = () =>
  apiFetch<{ ownerModeEnabled: boolean; isOwner: boolean }>("/api/owner/panel-mode");

export const setOwnerPanelMode = (enabled: boolean) =>
  apiFetch<{ ownerModeEnabled: boolean; isOwner: boolean }>("/api/owner/panel-mode", {
    method: "POST",
    body: { enabled },
  });

export const updateUserBilling = (userId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/admin/user/${encodeURIComponent(userId)}/billing`, {
    method: "PUT",
    body,
  });

export type OwnerBotSummary = {
  id: string;
  label: string;
  enabled: boolean;
  status: string;
  username: string;
  displayName: string;
  applicationId: string;
  avatar: string | null;
  avatarUrl: string | null;
  guildCount: number;
  ping: number | null;
  tokenHint: string;
  inviteUrl: string;
  lastError: string | null;
};

export const getOwnerBots = () => apiFetch<{ bots: OwnerBotSummary[] }>("/api/admin/bots");

export const createOwnerBot = (body: { label?: string; token: string }) =>
  apiFetch<{ bot: OwnerBotSummary }>("/api/admin/bots", { method: "POST", body });

export const updateOwnerBot = (botId: string, body: Record<string, unknown>) =>
  apiFetch<{ bot: OwnerBotSummary }>(`/api/admin/bots/${encodeURIComponent(botId)}`, {
    method: "PATCH",
    body,
  });

export const deleteOwnerBot = (botId: string) =>
  apiFetch<{ success: boolean }>(`/api/admin/bots/${encodeURIComponent(botId)}`, { method: "DELETE" });

export const updateOwnerBotProfile = (botId: string, body: { username: string }) =>
  apiFetch<{ bot: OwnerBotSummary }>(`/api/admin/bots/${encodeURIComponent(botId)}/profile`, {
    method: "POST",
    body,
  });

export const updateOwnerBotAvatar = (botId: string, form: FormData) =>
  apiForm<{ bot: OwnerBotSummary }>(`/api/admin/bots/${encodeURIComponent(botId)}/avatar`, form);

export const getOwnerBotGuilds = (botId: string) =>
  apiFetch<{ guilds: unknown[] }>(`/api/admin/bots/${encodeURIComponent(botId)}/guilds`);

export const getOwnerBotChannels = (botId: string, guildId: string) =>
  apiFetch<{ channels: unknown[] }>(
    `/api/admin/bots/${encodeURIComponent(botId)}/guilds/${encodeURIComponent(guildId)}/channels`
  );

export const getOwnerBotChat = (
  botId: string,
  params: { guildId: string; channelId: string; limit?: number; before?: string }
) => {
  const q = new URLSearchParams({
    guildId: params.guildId,
    channelId: params.channelId,
  });
  if (params.limit) q.set("limit", String(params.limit));
  if (params.before) q.set("before", params.before);
  return apiFetch<{ messages: unknown[]; botId: string }>(
    `/api/admin/bots/${encodeURIComponent(botId)}/chat?${q}`
  );
};

export const sendOwnerBotChat = (
  botId: string,
  body: { guildId: string; channelId: string; content: string }
) =>
  apiFetch<{ message: unknown }>(`/api/admin/bots/${encodeURIComponent(botId)}/chat`, {
    method: "POST",
    body,
  });

// ─── Guild base ─────────────────────────────────────────────────────

export const getGuildInfo = (guildId: string) =>
  apiFetch<Record<string, unknown>>(`/api/guild/${g(guildId)}/info`);

export const getGuildChannels = (guildId: string) =>
  apiFetch<unknown[]>(`/api/guild/${g(guildId)}/channels`);

export const getGuildMembers = (guildId: string, query?: string) => {
  const q = query ? `?q=${encodeURIComponent(query)}` : "";
  return apiFetch<unknown[]>(`/api/guild/${g(guildId)}/members${q}`);
};

export const getGuildBans = (guildId: string) =>
  apiFetch<unknown[]>(`/api/guild/${g(guildId)}/bans`);

export const unbanMember = (guildId: string, body: { userId: string; reason?: string }) =>
  apiFetch(`/api/guild/${g(guildId)}/unban`, { method: "POST", body });

export const moderateMember = (body: Record<string, unknown>) =>
  apiFetch("/api/moderate", { method: "POST", body });

export const refreshPanelEmbeds = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/panel-embeds-refresh`, { method: "POST" });

// ─── Welcome / goodbye / verify ─────────────────────────────────────

export const getWelcomeConfig = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/welcome-config`);

export const saveWelcomeConfig = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/welcome-config`, { method: "POST", body });

export const testWelcome = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/welcome-test`, { method: "POST" });

export const previewWelcomeCard = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/welcome-card-preview`, { method: "POST", body });

export async function previewWelcomeCardBlob(guildId: string, body: Record<string, unknown>): Promise<Blob> {
  const response = await fetch(`/api/guild/${g(guildId)}/welcome-card-preview`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "image/png" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = (payload as { error?: string } | null)?.error || `Error ${response.status} al generar vista previa`;
    throw new Error(message);
  }
  return response.blob();
}

export const getGoodbyeConfig = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/goodbye-config`);

export const saveGoodbyeConfig = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/goodbye-config`, { method: "POST", body });

export const testGoodbye = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/goodbye-test`, { method: "POST" });

export const getVerifyConfig = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/verify-config`);

export const saveVerifyConfig = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/verify-config`, { method: "POST", body });

export const publishVerify = (guildId: string, body?: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/verify-publish`, { method: "POST", body });

export const updateVerifyEmbed = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/verify-embed-update`, { method: "POST", body });

export const syncVerifyPermissions = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/verify-sync-permissions`, { method: "POST", body });

export const uploadVerifyImage = (guildId: string, file: File) => {
  const form = new FormData();
  form.append("imageFile", file);
  return apiForm(`/api/guild/${g(guildId)}/verify-image`, form);
};

export const uploadWelcomeImage = (guildId: string, file: File, slot?: string) => {
  const form = new FormData();
  form.append("imageFile", file);
  if (slot) form.append("slot", slot);
  return apiForm(`/api/guild/${g(guildId)}/welcome-image`, form);
};

export const deleteWelcomeImage = (guildId: string, slot: string) =>
  apiFetch(`/api/guild/${g(guildId)}/welcome-image`, { method: "DELETE", body: { slot } });

export const deleteVerifyImage = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/verify-image`, { method: "DELETE" });

// ─── Eventos y sorteos ──────────────────────────────────────────────

export const getEventsGiveawaysConfig = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/events-giveaways-config`);

export const saveEventsGiveawaysConfig = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/events-giveaways-config`, { method: "POST", body });

export const listGiveaways = (guildId: string, status?: string) => {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<{ giveaways: Record<string, unknown>[] }>(`/api/guild/${g(guildId)}/giveaways${query}`);
};

export const createGiveaway = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/giveaways/create`, { method: "POST", body });

export const endGiveaway = (guildId: string, giveawayId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/giveaways/${encodeURIComponent(giveawayId)}/end`, { method: "POST" });

export const rerollGiveaway = (guildId: string, giveawayId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/giveaways/${encodeURIComponent(giveawayId)}/reroll`, { method: "POST" });

export const listServerEvents = (guildId: string) =>
  apiFetch<{ events: Record<string, unknown>[] }>(`/api/guild/${g(guildId)}/server-events`);

export const createServerEvent = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/server-events/create`, { method: "POST", body });

export const cancelServerEvent = (guildId: string, eventId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/server-events/${encodeURIComponent(eventId)}/cancel`, { method: "POST" });

// ─── Tickets ────────────────────────────────────────────────────────

export const getTicketConfig = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/ticket-config`);

export const saveTicketConfig = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/ticket-config`, { method: "POST", body });

export const publishTickets = (guildId: string, body?: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/ticket-publish`, { method: "POST", body });

export const getTicketsOverview = (guildId: string, params?: { historyLimit?: number }) => {
  const search = new URLSearchParams();
  if (params?.historyLimit) search.set("historyLimit", String(params.historyLimit));
  const query = search.toString();
  return apiFetch(`/api/guild/${g(guildId)}/tickets/overview${query ? `?${query}` : ""}`);
};

export const acceptTicket = (guildId: string, requestId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/tickets/pending/${encodeURIComponent(requestId)}/accept`, {
    method: "POST",
  });

export const claimTicket = (guildId: string, channelId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/tickets/active/${encodeURIComponent(channelId)}/claim`, {
    method: "POST",
  });

export const closeTicket = (guildId: string, channelId: string, body?: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/tickets/active/${encodeURIComponent(channelId)}/close`, {
    method: "POST",
    body,
  });

export const getTicketMessages = (guildId: string, channelId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/tickets/active/${encodeURIComponent(channelId)}/messages`);

export const sendTicketMessage = (guildId: string, channelId: string, body: { content: string }) =>
  apiFetch(`/api/guild/${g(guildId)}/tickets/active/${encodeURIComponent(channelId)}/messages`, {
    method: "POST",
    body,
  });

export const unclaimTicket = (guildId: string, channelId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/tickets/active/${encodeURIComponent(channelId)}/unclaim`, {
    method: "POST",
  });

export const getTicketReport = (guildId: string, reportId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/tickets/report/${encodeURIComponent(reportId)}`);

export const deleteTicketReport = (guildId: string, reportId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/tickets/reports/${encodeURIComponent(reportId)}`, {
    method: "DELETE",
  });

export const updateTicketEmbed = (guildId: string, body?: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/ticket-embed-update`, { method: "POST", body });

// ─── Leveling ───────────────────────────────────────────────────────

export const getLevelingConfig = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/leveling-config`);

export const saveLevelingConfig = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/leveling-config`, { method: "POST", body });

export const getLevelingLeaderboard = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/leveling-leaderboard`);

// ─── Automation / security / voice / streams ────────────────────────

export const getAntiRaidConfig = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/anti-raid-config`);

export const saveAntiRaidConfig = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/anti-raid-config`, { method: "POST", body });

export const getTempVoiceConfig = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/temp-voice-config`);

export const saveTempVoiceConfig = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/temp-voice-config`, { method: "POST", body });

export const getStreamAlertConfig = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/stream-alert-config`);

export const saveStreamAlertConfig = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/stream-alert-config`, { method: "POST", body });

export const testStreamAlert = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/stream-alert-test`, { method: "POST", body });

export const getChannelSetup = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/channel-setup`);

export const applyChannelSetup = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/channel-setup/apply`, { method: "POST", body });

// ─── Gacha ──────────────────────────────────────────────────────────

export const getGachaConfig = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/gacha-config`);

export const saveGachaConfig = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/gacha-config`, { method: "POST", body });

export const getGachaStats = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/gacha-stats`);

export const getGachaLeaderboard = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/gacha-leaderboard`);

export const getGachaShop = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/gacha-shop`);

export const getGachaMarket = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/gacha-market`);

export const gachaCatalogImageUrl = (guildId: string, characterId: string, cacheBust = false) => {
  const base = `/api/guild/${g(guildId)}/gacha-catalog/${encodeURIComponent(characterId)}/image`;
  return cacheBust ? `${base}?t=${Date.now()}` : base;
};

export const saveGachaCatalogItem = (guildId: string, characterId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/gacha-catalog/${encodeURIComponent(characterId)}`, { method: "POST", body });

export const deleteGachaCatalogItem = (guildId: string, characterId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/gacha-catalog/${encodeURIComponent(characterId)}`, { method: "DELETE" });

export const uploadGachaCatalogImage = (guildId: string, characterId: string, file: File) => {
  const form = new FormData();
  form.append("characterId", characterId);
  form.append("imageFile", file);
  return apiForm(`/api/guild/${g(guildId)}/gacha-catalog-upload`, form);
};

export const getGachaInventory = (
  guildId: string,
  params?: { userId?: string; q?: string; rarity?: string; series?: string; limit?: number }
) => {
  const search = new URLSearchParams();
  if (params?.userId) search.set("userId", params.userId);
  if (params?.q) search.set("q", params.q);
  if (params?.rarity) search.set("rarity", params.rarity);
  if (params?.series) search.set("series", params.series);
  if (params?.limit) search.set("limit", String(params.limit));
  const query = search.toString();
  return apiFetch(`/api/guild/${g(guildId)}/gacha-inventory${query ? `?${query}` : ""}`);
};

// ─── Free games ─────────────────────────────────────────────────────

export const getFreeGamesConfig = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/free-games/config`);

export const saveFreeGamesConfig = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/free-games/config`, { method: "POST", body });

export const previewFreeGames = (
  guildId: string,
  params?: { epic?: boolean; steam?: boolean; force?: boolean; minDiscount?: number }
) => {
  const query = new URLSearchParams();
  if (params?.epic === false) query.set("epic", "0");
  if (params?.steam === false) query.set("steam", "0");
  if (params?.force) query.set("force", "1");
  if (typeof params?.minDiscount === "number") query.set("minDiscount", String(params.minDiscount));
  const suffix = query.toString() ? `?${query}` : "";
  return apiFetch(`/api/guild/${g(guildId)}/free-games/preview${suffix}`);
};

export const testFreeGames = (guildId: string, body?: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/free-games/test`, { method: "POST", body });

export const refreshFreeGamesEmbeds = (guildId: string, body?: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/free-games/refresh-embeds`, { method: "POST", body });

// ─── Crunchyroll ──────────────────────────────────────────────────

export const getCrunchyrollConfig = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/crunchyroll/config`);

export const saveCrunchyrollConfig = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/crunchyroll/config`, { method: "POST", body });

export const searchCrunchyrollSeries = (guildId: string, q: string) =>
  apiFetch(`/api/guild/${g(guildId)}/crunchyroll/search?q=${encodeURIComponent(q)}`);

export const previewCrunchyroll = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/crunchyroll/preview`);

export const testCrunchyrollAlert = (guildId: string, body?: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/crunchyroll/test`, { method: "POST", body });

// ─── Music ─────────────────────────────────────────────────────────

export const getMusicState = (guildId: string) =>
  apiFetch(`/api/guild/${g(guildId)}/music`);

export const controlMusic = (guildId: string, body: Record<string, unknown>) =>
  apiFetch(`/api/guild/${g(guildId)}/music/control`, { method: "POST", body });

// ─── Embeds ─────────────────────────────────────────────────────────

export const sendEmbed = (form: FormData) => apiForm("/api/send-embed", form);

export const getEmbedTemplates = (guildId: string) =>
  apiFetch(`/api/embed-templates/${g(guildId)}`);

export const saveEmbedTemplate = (form: FormData) => apiForm("/api/embed-templates", form);

export const deleteEmbedTemplate = (guildId: string, templateId: string) =>
  apiFetch(`/api/embed-templates/${g(guildId)}/${encodeURIComponent(templateId)}`, {
    method: "DELETE",
  });
