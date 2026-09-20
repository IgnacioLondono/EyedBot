"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Loader2,
  MessageSquare,
  Plus,
  Power,
  RefreshCw,
  Send,
  Server,
  Terminal,
  Trash2,
  UserPlus,
  Upload,
} from "lucide-react";
import {
  createOwnerBot,
  deleteOwnerBot,
  getOwnerBotChat,
  getOwnerBotChannels,
  getOwnerBotGuilds,
  getOwnerBots,
  sendOwnerBotChat,
  updateOwnerBot,
  updateOwnerBotAvatar,
  updateOwnerBotBanner,
  updateOwnerBotProfile,
} from "@/lib/api/endpoints";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { ColorInput, Field, SectionCard } from "@/components/features/shared";
import { Textarea } from "@/components/ui/Textarea";
import { discordAvatarUrl } from "@/lib/discord-media";
import { asArray, asRecord, formatDate, getErrorMessage, toStringValue } from "@/lib/utils";

type OwnerBot = {
  id: string;
  label: string;
  slug: string;
  enabled: boolean;
  panelEnabled: boolean;
  status: string;
  username: string;
  displayName: string;
  applicationId: string;
  clientId: string;
  hasClientSecret: boolean;
  assignedDiscordUserId: string;
  assignedDiscordUserIds: string[];
  brand: { name: string; logoUrl: string; primaryColor: string };
  panelPath: string;
  avatar: string | null;
  avatarUrl: string | null;
  banner: string | null;
  bannerUrl: string | null;
  description: string;
  guildCount: number;
  ping: number | null;
  commandsEnabled: boolean;
  tokenHint: string;
  inviteUrl: string;
  lastError: string | null;
};

type BotGuild = { id: string; name: string; iconUrl: string | null; memberCount: number | null };
type BotChannel = { id: string; name: string };
type ChatMessage = {
  id: string;
  content: string;
  authorName: string;
  authorAvatar: string | null;
  isBot: boolean;
  isSelf: boolean;
  timestamp: string;
};

function parseBot(raw: unknown): OwnerBot {
  const row = asRecord(raw);
  const appId = toStringValue(row.applicationId);
  const avatar = toStringValue(row.avatar) || null;
  const brandRow = asRecord(row.brand);
  const legacyAssignee = toStringValue(row.assignedDiscordUserId);
  const assigneeList = asArray(row.assignedDiscordUserIds)
    .map((id) => toStringValue(id))
    .filter(Boolean);
  return {
    id: toStringValue(row.id),
    label: toStringValue(row.label, "Bot auxiliar"),
    slug: toStringValue(row.slug),
    enabled: row.enabled !== false,
    panelEnabled: row.panelEnabled === true,
    status: toStringValue(row.status, "offline"),
    username: toStringValue(row.username),
    displayName: toStringValue(row.displayName || row.username || row.label, "Bot"),
    applicationId: appId,
    clientId: toStringValue(row.clientId || appId),
    hasClientSecret: row.hasClientSecret === true,
    assignedDiscordUserId: legacyAssignee,
    assignedDiscordUserIds: assigneeList.length ? assigneeList : legacyAssignee ? [legacyAssignee] : [],
    brand: {
      name: toStringValue(brandRow.name || row.label),
      logoUrl: toStringValue(brandRow.logoUrl),
      primaryColor: toStringValue(brandRow.primaryColor),
    },
    panelPath: toStringValue(row.panelPath),
    avatar,
    avatarUrl: toStringValue(row.avatarUrl) || discordAvatarUrl(appId, avatar),
    banner: toStringValue(row.banner) || null,
    bannerUrl: toStringValue(row.bannerUrl) || null,
    description: toStringValue(row.description) || "",
    guildCount: Number(row.guildCount) || 0,
    ping: row.ping == null ? null : Number(row.ping),
    commandsEnabled: row.commandsEnabled !== false,
    tokenHint: toStringValue(row.tokenHint),
    inviteUrl: toStringValue(row.inviteUrl) || botAdminInviteUrl(appId),
    lastError: toStringValue(row.lastError) || null,
  };
}

function statusBadge(status: string, enabled: boolean) {
  if (!enabled) return <Badge variant="default">Detenido</Badge>;
  if (status === "online") return <Badge variant="success">En línea</Badge>;
  if (status === "starting") return <Badge variant="warning">Conectando…</Badge>;
  if (status === "error") return <Badge variant="danger">Error</Badge>;
  return <Badge variant="default">Desconectado</Badge>;
}

function isIntentsError(message: string | null) {
  return /intents?/i.test(message || "");
}

function splitUserIds(text: string): string[] | undefined {
  const ids = text
    .split(/\r?\n/)
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length ? ids : undefined;
}

function developerBotUrl(applicationId: string) {
  if (!applicationId) return "https://discord.com/developers/applications";
  return `https://discord.com/developers/applications/${applicationId}/bot`;
}

function botAdminInviteUrl(applicationId: string, inviteUrl?: string) {
  if (inviteUrl) return inviteUrl;
  if (!applicationId) return "";
  return `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(applicationId)}&permissions=8&scope=bot%20applications.commands`;
}

function IntentsSetupHelp({ applicationId }: { applicationId?: string }) {
  return (
    <Alert variant="warning" title="Activa los intents en Discord">
      <div className="space-y-2 text-sm">
        <p>
          Cada bot auxiliar necesita los mismos intents privilegiados que EyedBot en su propia aplicación de Discord.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Abre{" "}
            <a
              href={developerBotUrl(applicationId || "")}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[color:var(--color-accent)] underline underline-offset-2"
            >
              Developer Portal → Bot
            </a>
          </li>
          <li>
            Activa <strong>SERVER MEMBERS INTENT</strong>
          </li>
          <li>
            Activa <strong>MESSAGE CONTENT INTENT</strong>
          </li>
          <li>
            Guarda y pulsa <strong>Iniciar</strong> aquí
          </li>
        </ol>
      </div>
    </Alert>
  );
}

export function OwnerBotsTab() {
  const { toast } = useToast();
  const [bots, setBots] = useState<OwnerBot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [newLabel, setNewLabel] = useState("");
  const [newToken, setNewToken] = useState("");
  const [newClientId, setNewClientId] = useState("");
  const [newClientSecret, setNewClientSecret] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandLogo, setNewBrandLogo] = useState("");
  const [newBrandColor, setNewBrandColor] = useState("");
  const [newPanelEnabled, setNewPanelEnabled] = useState(true);

  const [editLabel, setEditLabel] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editClientId, setEditClientId] = useState("");
  const [editClientSecret, setEditClientSecret] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editBrandName, setEditBrandName] = useState("");
  const [editBrandLogo, setEditBrandLogo] = useState("");
  const [editBrandColor, setEditBrandColor] = useState("");
  const [editPanelEnabled, setEditPanelEnabled] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [editDescription, setEditDescription] = useState("");
  const [detailTab, setDetailTab] = useState("perfil");

  const [guilds, setGuilds] = useState<BotGuild[]>([]);
  const [channels, setChannels] = useState<BotChannel[]>([]);
  const [guildId, setGuildId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const stickChatToBottomRef = useRef(true);

  const selected = useMemo(
    () => bots.find((bot) => bot.id === selectedId) || null,
    [bots, selectedId]
  );

  const loadBots = useCallback(async () => {
    const data = asRecord(await getOwnerBots());
    const list = asArray(data.bots).map(parseBot);
    setBots(list);
    setSelectedId((current) => {
      if (current && list.some((bot) => bot.id === current)) return current;
      return list[0]?.id || null;
    });
  }, []);

  useEffect(() => {
    void loadBots()
      .catch((err) => toast({ title: "No se pudieron cargar bots", description: getErrorMessage(err), tone: "danger" }))
      .finally(() => setLoading(false));
  }, [loadBots, toast]);

  useEffect(() => {
    if (!selected) return;
    setEditLabel(selected.label);
    setEditUsername(selected.username);
    setEditClientId(selected.clientId);
    setEditClientSecret("");
    setEditAssignee(selected.assignedDiscordUserIds.join("\n"));
    setEditSlug(selected.slug);
    setEditBrandName(selected.brand.name);
    setEditBrandLogo(selected.brand.logoUrl);
    setEditBrandColor(selected.brand.primaryColor);
    setEditPanelEnabled(selected.panelEnabled);
    setEditDescription(selected.description || "");
  }, [selected]);

  useEffect(() => {
    if (!selectedId || selected?.status !== "online") {
      setGuilds([]);
      setChannels([]);
      setGuildId("");
      setChannelId("");
      return;
    }
    void getOwnerBotGuilds(selectedId)
      .then((data) => {
        const list = asArray(asRecord(data).guilds).map((g) => {
          const row = asRecord(g);
          return {
            id: toStringValue(row.id),
            name: toStringValue(row.name, "Servidor"),
            iconUrl: toStringValue(row.iconUrl) || null,
            memberCount: row.memberCount == null ? null : Number(row.memberCount),
          };
        });
        setGuilds(list);
        setGuildId((prev) => (prev && list.some((g) => g.id === prev) ? prev : list[0]?.id || ""));
      })
      .catch((err) => toast({ title: "Servidores", description: getErrorMessage(err), tone: "danger" }));
  }, [selectedId, selected?.status, toast]);

  useEffect(() => {
    if (!selectedId || !guildId) {
      setChannels([]);
      setChannelId("");
      return;
    }
    void getOwnerBotChannels(selectedId, guildId)
      .then((data) => {
        const list = asArray(asRecord(data).channels).map((ch) => {
          const row = asRecord(ch);
          return { id: toStringValue(row.id), name: toStringValue(row.name, "canal") };
        });
        setChannels(list);
        setChannelId((prev) => (prev && list.some((c) => c.id === prev) ? prev : list[0]?.id || ""));
      })
      .catch((err) => toast({ title: "Canales", description: getErrorMessage(err), tone: "danger" }));
  }, [selectedId, guildId, toast]);

  const refreshChat = useCallback(async () => {
    if (!selectedId || !guildId || !channelId) return;
    setChatLoading(true);
    try {
      const data = asRecord(await getOwnerBotChat(selectedId, { guildId, channelId, limit: 50 }));
      const rows = asArray(data.messages).map((msg) => {
        const row = asRecord(msg);
        return {
          id: toStringValue(row.id),
          content: toStringValue(row.content),
          authorName: toStringValue(row.authorName, "Usuario"),
          authorAvatar: toStringValue(row.authorAvatar) || null,
          isBot: row.isBot === true,
          isSelf: row.isSelf === true,
          timestamp: toStringValue(row.timestamp),
        };
      });
      setMessages(rows);
    } catch (err) {
      toast({ title: "Chat", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setChatLoading(false);
    }
  }, [selectedId, guildId, channelId, toast]);

  useEffect(() => {
    if (!channelId) {
      setMessages([]);
      return;
    }
    stickChatToBottomRef.current = true;
    void refreshChat();
    const timer = setInterval(() => void refreshChat(), 8000);
    return () => clearInterval(timer);
  }, [channelId, refreshChat]);

  useEffect(() => {
    const box = chatScrollRef.current;
    if (!box || !stickChatToBottomRef.current) return;
    // Solo mueve el contenedor del chat, nunca el scroll de la página.
    box.scrollTop = box.scrollHeight;
  }, [messages]);

  function onChatScroll() {
    const box = chatScrollRef.current;
    if (!box) return;
    const distanceFromBottom = box.scrollHeight - box.scrollTop - box.clientHeight;
    stickChatToBottomRef.current = distanceFromBottom < 64;
  }

  async function handleCreate() {
    if (!newToken.trim()) {
      toast({ title: "Token requerido", description: "Pega el token del bot de Discord.", tone: "danger" });
      return;
    }
    setBusy("create");
    try {
      const data = asRecord(
        await createOwnerBot({
          label: newLabel.trim() || "Bot auxiliar",
          token: newToken.trim(),
          clientId: newClientId.trim() || undefined,
          clientSecret: newClientSecret.trim() || undefined,
          assignedDiscordUserIds: splitUserIds(newAssignee),
          slug: newSlug.trim() || undefined,
          brand: {
            name: newBrandName.trim() || newLabel.trim() || undefined,
            logoUrl: newBrandLogo.trim() || undefined,
            primaryColor: newBrandColor.trim() || undefined,
          },
          panelEnabled: newPanelEnabled,
        })
      );
      const bot = parseBot(data.bot);
      setBots((prev) => [...prev, bot]);
      setSelectedId(bot.id);
      setNewLabel("");
      setNewToken("");
      setNewClientId("");
      setNewClientSecret("");
      setNewAssignee("");
      setNewSlug("");
      setNewBrandName("");
      setNewBrandLogo("");
      setNewBrandColor("");
      setNewPanelEnabled(true);
      toast({ title: "Bot creado", description: `${bot.displayName} está conectándose.`, tone: "success" });
      setTimeout(() => void loadBots(), 3000);
    } catch (err) {
      toast({ title: "No se pudo crear", description: getErrorMessage(err), tone: "danger" });
      await loadBots();
    } finally {
      setBusy(null);
    }
  }

  async function handleSavePanelSettings() {
    if (!selectedId) return;
    setBusy("panel");
    try {
      const body: Record<string, unknown> = {
        label: editLabel.trim() || undefined,
        slug: editSlug.trim() || undefined,
        clientId: editClientId.trim() || undefined,
        assignedDiscordUserIds: splitUserIds(editAssignee),
        panelEnabled: editPanelEnabled,
        brand: {
          name: editBrandName.trim(),
          logoUrl: editBrandLogo.trim(),
          primaryColor: editBrandColor.trim(),
        },
      };
      if (editClientSecret.trim()) body.clientSecret = editClientSecret.trim();
      const data = asRecord(await updateOwnerBot(selectedId, body));
      setBots((prev) => prev.map((b) => (b.id === selectedId ? parseBot(data.bot) : b)));
      setEditClientSecret("");
      toast({ title: "Panel / OAuth guardado", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("¿Eliminar este bot auxiliar? Se borrará el token guardado.")) return;
    setBusy(`delete-${id}`);
    try {
      await deleteOwnerBot(id);
      setBots((prev) => prev.filter((bot) => bot.id !== id));
      if (selectedId === id) setSelectedId(null);
      toast({ title: "Bot eliminado", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo eliminar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    setBusy(`toggle-${id}`);
    try {
      const data = asRecord(await updateOwnerBot(id, { enabled }));
      const bot = parseBot(data.bot);
      setBots((prev) => prev.map((item) => (item.id === id ? bot : item)));
      toast({ title: enabled ? "Bot iniciado" : "Bot detenido", tone: "success" });
    } catch (err) {
      toast({ title: "Error", description: getErrorMessage(err), tone: "danger" });
      await loadBots();
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleCommands(id: string, commandsEnabled: boolean) {
    setBusy(`commands-${id}`);
    try {
      const data = asRecord(await updateOwnerBot(id, { commandsEnabled }));
      const bot = parseBot(data.bot);
      setBots((prev) => prev.map((item) => (item.id === id ? bot : item)));
      toast({
        title: commandsEnabled ? "Comandos activados" : "Comandos desactivados",
        description: commandsEnabled
          ? "El bot volverá a registrar sus comandos."
          : "Se quitaron los comandos de este bot para que no dupliquen a EyedBot.",
        tone: "success",
      });
    } catch (err) {
      toast({ title: "Error", description: getErrorMessage(err), tone: "danger" });
      await loadBots();
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveProfile() {
    if (!selectedId) return;
    setBusy("profile");
    try {
      if (editLabel.trim() && editLabel.trim() !== selected?.label) {
        const data = asRecord(await updateOwnerBot(selectedId, { label: editLabel.trim() }));
        setBots((prev) => prev.map((b) => (b.id === selectedId ? parseBot(data.bot) : b)));
      }
      const wantsUsername = Boolean(editUsername.trim() && editUsername.trim() !== selected?.username);
      const wantsDescription = editDescription !== (selected?.description || "");
      if (wantsUsername || wantsDescription) {
        const body: { username?: string; description?: string } = {};
        if (wantsUsername) body.username = editUsername.trim();
        if (wantsDescription) body.description = editDescription.trim();
        const data = asRecord(await updateOwnerBotProfile(selectedId, body));
        setBots((prev) => prev.map((b) => (b.id === selectedId ? parseBot(data.bot) : b)));
      }
      toast({ title: "Perfil actualizado", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  async function handleAvatarChange(file: File | null) {
    if (!selectedId || !file) return;
    setBusy("avatar");
    try {
      const form = new FormData();
      form.append("avatar", file);
      const data = asRecord(await updateOwnerBotAvatar(selectedId, form));
      setBots((prev) => prev.map((b) => (b.id === selectedId ? parseBot(data.bot) : b)));
      toast({ title: "Avatar actualizado", tone: "success" });
    } catch (err) {
      toast({ title: "Avatar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  async function handleBannerChange(file: File | null) {
    if (!selectedId || !file) return;
    setBusy("banner");
    try {
      const form = new FormData();
      form.append("banner", file);
      const data = asRecord(await updateOwnerBotBanner(selectedId, form));
      setBots((prev) => prev.map((b) => (b.id === selectedId ? parseBot(data.bot) : b)));
      toast({ title: "Banner actualizado", tone: "success" });
    } catch (err) {
      toast({ title: "Banner", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  async function handleSendChat() {
    if (!selectedId || !guildId || !channelId || !chatInput.trim()) return;
    setBusy("chat");
    try {
      await sendOwnerBotChat(selectedId, { guildId, channelId, content: chatInput.trim() });
      setChatInput("");
      stickChatToBottomRef.current = true;
      await refreshChat();
    } catch (err) {
      toast({ title: "No se pudo enviar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <Alert title="Cargando bots auxiliares" description="Consultando instancias registradas." />;
  }

  return (
    <div className="space-y-5">
      <SectionCard
        title="Crear bot asignable"
        description="Pegá Token + Client ID + Client Secret de la app en Discord Developer Portal. Asignalo a uno o más Discord user IDs (uno por línea) y activá el panel branded en /t/{slug}."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Nombre interno" description="Etiqueta para identificar el bot en el panel.">
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ej. Bot del servidor" />
          </Field>
          <Field label="Slug del panel" description="ID de la URL del panel asignable: /t/{slug}.">
            <Input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="mi-bot" />
          </Field>
          <Field label="Token del bot" description="Token de la app en Discord Developer Portal.">
            <Input
              type="password"
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              placeholder="Token desde Discord Developer Portal"
            />
          </Field>
          <Field label="Client ID (Application ID)" description="ID de aplicación del bot en Discord.">
            <Input value={newClientId} onChange={(e) => setNewClientId(e.target.value)} placeholder="Opcional si coincide con el token" />
          </Field>
          <Field label="Client Secret (OAuth2)" description="Secreto OAuth2 requerido para el login del panel.">
            <Input
              type="password"
              value={newClientSecret}
              onChange={(e) => setNewClientSecret(e.target.value)}
              placeholder="Requerido para login del panel"
            />
          </Field>
          <Field
            label="Asignar a Discord user IDs"
            description="Un ID por línea. Todos estos usuarios podrán entrar al bot auxiliar."
          >
            <Textarea
              value={newAssignee}
              onChange={(e) => setNewAssignee(e.target.value)}
              placeholder={"123456789012345678\n234567890123456789"}
              rows={4}
            />
          </Field>
          <Field label="Marca · nombre" description="Nombre que se muestra en el panel branded.">
            <Input value={newBrandName} onChange={(e) => setNewBrandName(e.target.value)} placeholder="Nombre visible" />
          </Field>
          <Field label="Marca · logo URL" description="URL de la imagen de logo del panel branded.">
            <Input value={newBrandLogo} onChange={(e) => setNewBrandLogo(e.target.value)} placeholder="https://..." />
          </Field>
          <Field label="Marca · color" description="Color principal del panel branded.">
            <ColorInput value={newBrandColor} onChange={setNewBrandColor} placeholder="f59e0b" />
          </Field>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-[var(--foreground)]">
          <input
            type="checkbox"
            checked={newPanelEnabled}
            onChange={(e) => setNewPanelEnabled(e.target.checked)}
            className="rounded border-[color:var(--color-border-subtle)]"
          />
          Habilitar panel completo (módulos + OAuth en /t/slug)
        </label>
        <div className="mt-4 flex items-end">
          <Button onClick={() => void handleCreate()} disabled={busy === "create"}>
            {busy === "create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Crear y conectar
          </Button>
        </div>
        <div className="mt-4">
          <IntentsSetupHelp />
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <SectionCard title="Tus bots" description={`${bots.length} registrado(s)`}>
          <div className="space-y-2">
            {bots.length ? (
              bots.map((bot) => (
                <button
                  key={bot.id}
                  type="button"
                  onClick={() => setSelectedId(bot.id)}
                  className={`panel-list-item flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left ${
                    selectedId === bot.id ? "panel-list-item-active" : ""
                  }`}
                >
                  {bot.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={bot.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="panel-icon-box flex h-10 w-10 rounded-full">
                      <Bot className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[var(--foreground)]">{bot.label}</p>
                    <p className="panel-muted truncate text-xs">
                      {bot.username || "—"} · {bot.guildCount} servidores
                    </p>
                  </div>
                  {statusBadge(bot.status, bot.enabled)}
                </button>
              ))
            ) : (
              <Alert title="Sin bots" description="Crea uno con el token de una aplicación en Discord Developer Portal." />
            )}
          </div>
        </SectionCard>

        {selected ? (
          <div className="space-y-5">
            <Tabs
              items={[
                { id: "perfil", label: "Perfil" },
                { id: "panel", label: "Panel / OAuth" },
                { id: "chat", label: "Chat" },
              ]}
              value={detailTab}
              onValueChange={setDetailTab}
            />

            {detailTab === "perfil" ? (
            <SectionCard title={selected.label} description="Banner, foto, nombre y descripción del bot en Discord.">
              <div className="relative mb-4 overflow-hidden rounded-2xl border border-white/10">
                {selected.bannerUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.bannerUrl} alt="" className="h-24 w-full object-cover" />
                ) : (
                  <div className="flex h-24 w-full items-center justify-center bg-[var(--color-surface-strong)] text-xs text-[var(--theme-text-secondary)]">
                    Sin banner
                  </div>
                )}
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => void handleBannerChange(e.target.files?.[0] || null)}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute bottom-2 right-2"
                  disabled={busy === "banner" || selected.status !== "online"}
                  onClick={() => bannerInputRef.current?.click()}
                >
                  <Upload className="mr-1 h-3.5 w-3.5" />
                  {busy === "banner" ? "Subiendo…" : "Cambiar banner"}
                </Button>
              </div>
              <div className="flex flex-wrap items-start gap-4">
                <div className="relative">
                  {selected.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.avatarUrl} alt="" className="h-20 w-20 rounded-2xl object-cover" />
                  ) : (
                    <div className="panel-icon-box flex h-20 w-20 rounded-2xl">
                      <Bot className="h-8 w-8" />
                    </div>
                  )}
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => void handleAvatarChange(e.target.files?.[0] || null)}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2 w-full"
                    disabled={busy === "avatar" || selected.status !== "online"}
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <Upload className="mr-1 h-3.5 w-3.5" />
                    Cambiar foto
                  </Button>
                </div>

                <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                  <Field label="Nombre interno" description="Etiqueta con la que identificas el bot en el panel.">
                    <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
                  </Field>
                  <Field label="Usuario en Discord" description="Nombre de usuario de Discord que se muestra del bot.">
                    <Input
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      placeholder={selected.username || "username"}
                    />
                  </Field>
                  <div className="panel-muted sm:col-span-2 flex flex-wrap gap-2 text-xs">
                    <span>ID: {selected.applicationId || "—"}</span>
                    <span>Token: {selected.tokenHint}</span>
                    {selected.ping != null ? <span>Ping: {selected.ping} ms</span> : null}
                    {statusBadge(selected.status, selected.enabled)}
                  </div>
                  {selected.lastError ? (
                    <p className="sm:col-span-2 text-sm text-red-400">{selected.lastError}</p>
                  ) : null}
                </div>
              </div>

              <Field
                label="Descripción del bot"
                description="Se muestra en la tarjeta del bot dentro de Discord (máx. 400 caracteres)."
              >
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Describe para qué sirve este bot…"
                  rows={3}
                  maxLength={400}
                />
                <p className="panel-muted pt-1 text-right text-xs">{editDescription.length}/400</p>
              </Field>

              {isIntentsError(selected.lastError) ? (
                <div className="mt-4">
                  <IntentsSetupHelp applicationId={selected.applicationId} />
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {selected.inviteUrl ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => window.open(selected.inviteUrl, "_blank", "noopener,noreferrer")}
                  >
                    <UserPlus className="mr-1 h-3.5 w-3.5" />
                    Invitar con admin
                  </Button>
                ) : null}
                {selected.panelPath ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => window.open(selected.panelPath, "_blank", "noopener,noreferrer")}
                  >
                    Abrir /t/{selected.slug || "…"}
                  </Button>
                ) : null}
                <Button size="sm" disabled={busy === "profile"} onClick={() => void handleSaveProfile()}>
                  Guardar perfil
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!!busy}
                  onClick={() => void handleToggle(selected.id, !selected.enabled)}
                >
                  <Power className="mr-1 h-3.5 w-3.5" />
                  {selected.enabled ? "Detener" : "Iniciar"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy === `commands-${selected.id}`}
                  onClick={() => void handleToggleCommands(selected.id, !selected.commandsEnabled)}
                  title="Evita que este bot duplique los comandos de EyedBot"
                >
                  <Terminal className="mr-1 h-3.5 w-3.5" />
                  {selected.commandsEnabled ? "Desactivar comandos" : "Activar comandos"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === `delete-${selected.id}`}
                  onClick={() => void handleDelete(selected.id)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Eliminar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void loadBots()}>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  Actualizar
                </Button>
              </div>
            </SectionCard>
            ) : null}

            {detailTab === "panel" ? (
            <SectionCard
              title="Panel asignable / OAuth"
              description="Redirect a registrar en Discord: /t/{slug}/callback. Los usuarios asignados entran por /t/{slug}."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Slug" description="ID de la URL del panel asignable: /t/{slug}.">
                  <Input value={editSlug} onChange={(e) => setEditSlug(e.target.value)} />
                </Field>
                <Field
                  label="Discord user IDs asignados"
                  description="Un ID por línea. Todos entran al panel /t/{slug}."
                >
                  <Textarea
                    value={editAssignee}
                    onChange={(e) => setEditAssignee(e.target.value)}
                    placeholder={"123456789012345678\n234567890123456789"}
                    rows={4}
                  />
                </Field>
                <Field label="Client ID" description="ID de aplicación del bot en Discord.">
                  <Input value={editClientId} onChange={(e) => setEditClientId(e.target.value)} />
                </Field>
                <Field label={selected.hasClientSecret ? "Client Secret (dejar vacío para no cambiar)" : "Client Secret"} description="Secreto OAuth2 para el login del panel.">
                  <Input
                    type="password"
                    value={editClientSecret}
                    onChange={(e) => setEditClientSecret(e.target.value)}
                    placeholder={selected.hasClientSecret ? "••••••••" : "Pegar secret"}
                  />
                </Field>
                <Field label="Marca · nombre" description="Nombre que se muestra en el panel branded.">
                  <Input value={editBrandName} onChange={(e) => setEditBrandName(e.target.value)} />
                </Field>
                <Field label="Marca · logo URL" description="URL de la imagen de logo del panel branded.">
                  <Input value={editBrandLogo} onChange={(e) => setEditBrandLogo(e.target.value)} />
                </Field>
                <Field label="Marca · color" description="Color principal del panel branded.">
                  <ColorInput value={editBrandColor} onChange={setEditBrandColor} placeholder="f59e0b" />
                </Field>
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm text-[var(--foreground)]">
                <input
                  type="checkbox"
                  checked={editPanelEnabled}
                  onChange={(e) => setEditPanelEnabled(e.target.checked)}
                  className="rounded border-[color:var(--color-border-subtle)]"
                />
                Panel completo habilitado
              </label>
              {selected.panelPath ? (
                <p className="panel-muted mt-2 text-xs">
                  Landing: {selected.panelPath} · OAuth callback: {selected.panelPath}/callback
                </p>
              ) : null}
              <div className="mt-4">
                <Button size="sm" disabled={busy === "panel"} onClick={() => void handleSavePanelSettings()}>
                  {busy === "panel" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Guardar OAuth / marca / assignee
                </Button>
              </div>
            </SectionCard>
            ) : null}

            {detailTab === "chat" ? (
            <SectionCard
              title="Chat en servidor"
              description="Elige servidor y canal donde está el bot. Los mensajes se envían como el bot; las respuestas de comandos aparecen en el hilo."
            >
              {selected.status !== "online" ? (
                <Alert title="Bot desconectado" description="Inicia el bot para elegir servidor y chatear." variant="warning" />
              ) : (
                <>
                  <div className="mb-4 grid gap-3 sm:grid-cols-2">
                    <Field label="Servidor" description="Servidor donde está invitado el bot auxiliar.">
                        <option value="">Seleccionar…</option>
                        {guilds.map((guild) => (
                          <option key={guild.id} value={guild.id}>
                            {guild.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Canal de texto" description="Canal del servidor donde se enviarán los mensajes como el bot.">
                      <Select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                        <option value="">Seleccionar…</option>
                        {channels.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            #{ch.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="panel-muted flex items-center gap-2 text-xs">
                      <MessageSquare className="h-4 w-4" />
                      {channelId ? "Actualización automática cada 8 s" : "Selecciona un canal"}
                    </div>
                    <Button size="sm" variant="ghost" disabled={!channelId || chatLoading} onClick={() => void refreshChat()}>
                      <RefreshCw className={`h-4 w-4 ${chatLoading ? "animate-spin" : ""}`} />
                    </Button>
                  </div>

                  <div
                    ref={chatScrollRef}
                    onScroll={onChatScroll}
                    className="panel-inset max-h-80 space-y-2 overflow-y-auto p-3"
                  >
                    {messages.length ? (
                      messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex gap-2 rounded-xl px-2 py-1.5 ${msg.isSelf ? "bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-surface-strong))]" : "bg-[color-mix(in_srgb,var(--foreground)_4%,var(--color-surface-strong))]"}`}
                        >
                          {msg.authorAvatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={msg.authorAvatar} alt="" className="mt-0.5 h-7 w-7 rounded-full object-cover" />
                          ) : (
                            <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-700 text-xs">
                              {msg.isBot ? <Bot className="h-3.5 w-3.5" /> : "U"}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="panel-muted text-xs">
                              {msg.authorName}
                              {msg.isSelf ? " (este bot)" : ""} · {formatDate(msg.timestamp)}
                            </p>
                            <p className="whitespace-pre-wrap break-words text-sm text-[var(--foreground)]">{msg.content || "—"}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="panel-muted py-8 text-center text-sm">
                        {channelId ? "Sin mensajes recientes en este canal." : "Elige un canal para ver la conversación."}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Escribe un mensaje… (usa /comandos en Discord o escribe aquí)"
                      disabled={!channelId || busy === "chat"}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleSendChat();
                        }
                      }}
                    />
                    <Button disabled={!channelId || !chatInput.trim() || busy === "chat"} onClick={() => void handleSendChat()}>
                      {busy === "chat" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="panel-muted mt-2 flex items-center gap-1 text-xs">
                    <Server className="h-3.5 w-3.5" />
                    Usa <strong>Invitar con admin</strong> arriba para añadir el bot a un servidor con permisos de administrador.
                  </p>
                </>
              )}
            </SectionCard>
            ) : null}
          </div>
        ) : bots.length ? null : null}
      </div>
    </div>
  );
}
