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
  Trash2,
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
  updateOwnerBotProfile,
} from "@/lib/api/endpoints";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field, SectionCard } from "@/components/features/shared";
import { discordAvatarUrl } from "@/lib/discord-media";
import { asArray, asRecord, formatDate, getErrorMessage, toStringValue } from "@/lib/utils";

type OwnerBot = {
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
  return {
    id: toStringValue(row.id),
    label: toStringValue(row.label, "Bot auxiliar"),
    enabled: row.enabled !== false,
    status: toStringValue(row.status, "offline"),
    username: toStringValue(row.username),
    displayName: toStringValue(row.displayName || row.username || row.label, "Bot"),
    applicationId: appId,
    avatar,
    avatarUrl: toStringValue(row.avatarUrl) || discordAvatarUrl(appId, avatar),
    guildCount: Number(row.guildCount) || 0,
    ping: row.ping == null ? null : Number(row.ping),
    tokenHint: toStringValue(row.tokenHint),
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

export function OwnerBotsTab() {
  const { toast } = useToast();
  const [bots, setBots] = useState<OwnerBot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [newLabel, setNewLabel] = useState("");
  const [newToken, setNewToken] = useState("");

  const [editLabel, setEditLabel] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [guilds, setGuilds] = useState<BotGuild[]>([]);
  const [channels, setChannels] = useState<BotChannel[]>([]);
  const [guildId, setGuildId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

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
    void refreshChat();
    const timer = setInterval(() => void refreshChat(), 8000);
    return () => clearInterval(timer);
  }, [channelId, refreshChat]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleCreate() {
    if (!newToken.trim()) {
      toast({ title: "Token requerido", description: "Pega el token del bot de Discord.", tone: "danger" });
      return;
    }
    setBusy("create");
    try {
      const data = asRecord(await createOwnerBot({ label: newLabel.trim() || "Bot auxiliar", token: newToken.trim() }));
      const bot = parseBot(data.bot);
      setBots((prev) => [...prev, bot]);
      setSelectedId(bot.id);
      setNewLabel("");
      setNewToken("");
      toast({ title: "Bot creado", description: `${bot.displayName} está conectándose.`, tone: "success" });
      setTimeout(() => void loadBots(), 3000);
    } catch (err) {
      toast({ title: "No se pudo crear", description: getErrorMessage(err), tone: "danger" });
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
      if (editUsername.trim() && editUsername.trim() !== selected?.username) {
        const data = asRecord(await updateOwnerBotProfile(selectedId, { username: editUsername.trim() }));
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

  async function handleSendChat() {
    if (!selectedId || !guildId || !channelId || !chatInput.trim()) return;
    setBusy("chat");
    try {
      await sendOwnerBotChat(selectedId, { guildId, channelId, content: chatInput.trim() });
      setChatInput("");
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
        title="Crear bot auxiliar"
        description="Registra otro bot de Discord con las mismas funciones (comandos, tickets, niveles, etc.). El token solo lo ve el propietario."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Nombre interno">
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ej. Bot de pruebas" />
          </Field>
          <Field label="Token del bot">
            <Input
              type="password"
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              placeholder="Token desde Discord Developer Portal"
            />
          </Field>
          <div className="flex items-end">
            <Button onClick={() => void handleCreate()} disabled={busy === "create"}>
              {busy === "create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Crear y conectar
            </Button>
          </div>
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
                  className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                    selectedId === bot.id ? "border-violet-400/40 bg-violet-500/10" : "border-white/8 bg-black/20 hover:bg-white/5"
                  }`}
                >
                  {bot.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={bot.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800">
                      <Bot className="h-5 w-5 text-zinc-400" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">{bot.label}</p>
                    <p className="truncate text-xs text-zinc-500">
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
            <SectionCard title={selected.label} description="Perfil, estado y chat en servidor.">
              <div className="flex flex-wrap items-start gap-4">
                <div className="relative">
                  {selected.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.avatarUrl} alt="" className="h-20 w-20 rounded-2xl object-cover" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-800">
                      <Bot className="h-8 w-8 text-zinc-500" />
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
                  <Field label="Nombre interno">
                    <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
                  </Field>
                  <Field label="Usuario en Discord">
                    <Input
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      placeholder={selected.username || "username"}
                    />
                  </Field>
                  <div className="sm:col-span-2 flex flex-wrap gap-2 text-xs text-zinc-500">
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

              <div className="mt-4 flex flex-wrap gap-2">
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

            <SectionCard
              title="Chat en servidor"
              description="Elige servidor y canal donde está el bot. Los mensajes se envían como el bot; las respuestas de comandos aparecen en el hilo."
            >
              {selected.status !== "online" ? (
                <Alert title="Bot desconectado" description="Inicia el bot para elegir servidor y chatear." variant="warning" />
              ) : (
                <>
                  <div className="mb-4 grid gap-3 sm:grid-cols-2">
                    <Field label="Servidor">
                      <Select value={guildId} onChange={(e) => setGuildId(e.target.value)}>
                        <option value="">Seleccionar…</option>
                        {guilds.map((guild) => (
                          <option key={guild.id} value={guild.id}>
                            {guild.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Canal de texto">
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
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <MessageSquare className="h-4 w-4" />
                      {channelId ? "Actualización automática cada 8 s" : "Selecciona un canal"}
                    </div>
                    <Button size="sm" variant="ghost" disabled={!channelId || chatLoading} onClick={() => void refreshChat()}>
                      <RefreshCw className={`h-4 w-4 ${chatLoading ? "animate-spin" : ""}`} />
                    </Button>
                  </div>

                  <div className="max-h-80 space-y-2 overflow-y-auto rounded-2xl border border-white/8 bg-black/30 p-3">
                    {messages.length ? (
                      messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex gap-2 rounded-xl px-2 py-1.5 ${msg.isSelf ? "bg-violet-500/10" : "bg-white/5"}`}
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
                            <p className="text-xs text-zinc-400">
                              {msg.authorName}
                              {msg.isSelf ? " (este bot)" : ""} · {formatDate(msg.timestamp)}
                            </p>
                            <p className="whitespace-pre-wrap break-words text-sm text-zinc-100">{msg.content || "—"}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="py-8 text-center text-sm text-zinc-500">
                        {channelId ? "Sin mensajes recientes en este canal." : "Elige un canal para ver la conversación."}
                      </p>
                    )}
                    <div ref={chatEndRef} />
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
                  <p className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
                    <Server className="h-3.5 w-3.5" />
                    Invita el bot al servidor desde Discord Developer Portal → OAuth2 → URL con permisos de bot.
                  </p>
                </>
              )}
            </SectionCard>
          </div>
        ) : bots.length ? null : null}
      </div>
    </div>
  );
}
