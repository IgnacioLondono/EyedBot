"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Clock3,
  Cpu,
  Crown,
  Globe2,
  Palette,
  RefreshCw,
  Search,
  Server,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import { getLoginRegistry, getLogs, getStats, updateUserBilling } from "@/lib/api/endpoints";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field, PaneGrid, SectionCard } from "@/components/features/shared";
import { discordAvatarUrl, discordGuildIconUrl } from "@/lib/discord-media";
import { asArray, asRecord, formatDate, getErrorMessage, toNumberValue, toStringValue } from "@/lib/utils";
import { OwnerBotsTab } from "@/components/features/settings/OwnerBotsTab";

const OWNER_TABS = [
  { id: "overview", label: "Resumen" },
  { id: "bots", label: "Bots" },
  { id: "users", label: "Usuarios" },
  { id: "logs", label: "Logs" },
  { id: "system", label: "Sistema" },
];

type RegistryGuild = {
  id: string;
  name: string;
  idSuffix: string;
  iconUrl: string;
  role: string;
  manages: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  botInGuild: boolean;
  memberCount: number | null;
  guildOwnerTag: string;
};

type RegistryUser = {
  userId: string;
  username: string;
  globalName: string;
  avatar: string | null;
  avatarUrl: string;
  loginCount: number;
  firstLoginAt: string;
  lastLoginAt: string;
  guildCount: number;
  managedGuildCount: number;
  guilds: RegistryGuild[];
  managedGuilds: RegistryGuild[];
  billing: {
    active: boolean;
    status: string;
    currentPeriodEnd: string;
    sourceEvent: string;
    updatedAt: string;
  };
};

type RegistrySummary = {
  totalLogins: number;
  uniqueUsers: number;
  uniqueGuildsSeen: number;
  updatedAt: string;
};

function parseRegistryGuild(guild: unknown): RegistryGuild {
  const row = asRecord(guild);
  return {
    id: toStringValue(row.id),
    name: toStringValue(row.name, "Servidor"),
    idSuffix: toStringValue(row.idSuffix),
    iconUrl: toStringValue(row.iconUrl),
    role: toStringValue(row.role, "member"),
    manages: row.manages === true,
    isOwner: row.isOwner === true,
    isAdmin: row.isAdmin === true,
    botInGuild: row.botInGuild === true,
    memberCount: row.memberCount == null ? null : toNumberValue(row.memberCount),
    guildOwnerTag: toStringValue(row.guildOwnerTag),
  };
}

function guildRoleLabel(guild: RegistryGuild) {
  if (guild.isOwner || guild.role === "owner") return "Dueño";
  if (guild.isAdmin || guild.role === "admin") return "Admin";
  return "Miembro";
}

function guildIconSrc(guild: RegistryGuild) {
  return discordGuildIconUrl(guild.id, guild.iconUrl) || guild.iconUrl;
}

function GuildChip({ guild }: { guild: RegistryGuild }) {
  const iconSrc = guildIconSrc(guild);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300">
      {iconSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconSrc} alt="" className="h-4 w-4 rounded-full object-cover" />
      ) : (
        <Server className="h-3.5 w-3.5 text-zinc-500" />
      )}
      <span className="truncate">{guild.name}</span>
    </span>
  );
}

function GuildCard({ guild }: { guild: RegistryGuild }) {
  const iconSrc = guildIconSrc(guild);
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/5 px-3 py-2.5">
      {iconSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={iconSrc} alt="" className="h-9 w-9 rounded-lg object-cover" />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800">
          <Server className="h-4 w-4 text-zinc-500" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-white">{guild.name}</p>
          <Badge variant={guild.isOwner ? "premium" : guild.manages ? "success" : "default"}>
            {guildRoleLabel(guild)}
          </Badge>
          {guild.botInGuild ? (
            <Badge variant="success">Bot activo</Badge>
          ) : (
            <Badge variant="warning">Sin bot</Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          ID ···{guild.idSuffix || guild.id.slice(-4)}
          {guild.memberCount != null ? ` · ${guild.memberCount.toLocaleString("es-ES")} miembros` : ""}
        </p>
        {guild.guildOwnerTag ? (
          <p className="mt-1 text-xs text-zinc-400">Dueño Discord: {guild.guildOwnerTag}</p>
        ) : null}
      </div>
    </div>
  );
}

function formatUptime(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "N/D";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function parseRegistryUser(entry: unknown): RegistryUser {
  const data = asRecord(entry);
  const billing = asRecord(data.billing);
  return {
    userId: toStringValue(data.userId),
    username: toStringValue(data.username, "Usuario"),
    globalName: toStringValue(data.globalName || data.username, "Usuario"),
    avatar: toStringValue(data.avatar) || null,
    avatarUrl: toStringValue(data.avatarUrl) || discordAvatarUrl(toStringValue(data.userId), toStringValue(data.avatar)),
    loginCount: toNumberValue(data.loginCount),
    firstLoginAt: toStringValue(data.firstLoginAt),
    lastLoginAt: toStringValue(data.lastLoginAt),
    guildCount: toNumberValue(data.guildCount),
    guilds: asArray(data.guilds).map(parseRegistryGuild),
    managedGuilds: (() => {
      const managed = asArray(data.managedGuilds).map(parseRegistryGuild);
      if (managed.length) return managed;
      return asArray(data.guilds).map(parseRegistryGuild).filter((guild) => guild.manages);
    })(),
    managedGuildCount: (() => {
      const explicit = toNumberValue(data.managedGuildCount);
      if (explicit > 0) return explicit;
      const managed = asArray(data.managedGuilds).map(parseRegistryGuild);
      if (managed.length) return managed.length;
      return asArray(data.guilds).map(parseRegistryGuild).filter((guild) => guild.manages).length;
    })(),
    billing: {
      active: billing.active === true,
      status: toStringValue(billing.status, "inactive"),
      currentPeriodEnd: toStringValue(billing.currentPeriodEnd),
      sourceEvent: toStringValue(billing.sourceEvent),
      updatedAt: toStringValue(billing.updatedAt),
    },
  };
}

function UserRow({
  user,
  expanded,
  onToggle,
  onBilling,
  busy,
}: {
  user: RegistryUser;
  expanded: boolean;
  onToggle: () => void;
  onBilling: (action: string, days?: number) => void;
  busy: boolean;
}) {
  const displayName = user.globalName || user.username;

  return (
    <div className="rounded-2xl border border-white/8 bg-black/20">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
              <Users className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-medium text-white">{displayName}</p>
            <p className="text-xs text-zinc-500">
              {user.userId} · {user.loginCount} accesos · {user.managedGuildCount || user.guildCount} gestionados
            </p>
            <p className="mt-1 text-xs text-zinc-600">Último acceso: {user.lastLoginAt ? formatDate(user.lastLoginAt) : "—"}</p>
          </div>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={user.billing.active ? "premium" : "default"}>
            {user.billing.active ? "EyedPlus+" : user.billing.status}
          </Badge>
          <Button variant="secondary" size="sm" onClick={onToggle}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {(user.managedGuilds.length ? user.managedGuilds : user.guilds).length ? (
        <div className="flex flex-wrap gap-1.5 border-t border-white/5 px-4 py-3">
          {(user.managedGuilds.length ? user.managedGuilds : user.guilds).slice(0, 5).map((guild) => (
            <GuildChip key={guild.id} guild={guild} />
          ))}
          {(user.managedGuilds.length ? user.managedGuilds : user.guilds).length > 5 ? (
            <span className="self-center text-xs text-zinc-500">
              +{(user.managedGuilds.length ? user.managedGuilds : user.guilds).length - 5} más
            </span>
          ) : null}
        </div>
      ) : null}

      {expanded ? (
        <div className="border-t border-white/8 px-4 py-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => onBilling("grant", 30)}>
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              Dar Plus 30d
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onBilling("trial", 7)}>
              Prueba 7d
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onBilling("revoke")}>
              Quitar Plus
            </Button>
          </div>

          {user.billing.currentPeriodEnd ? (
            <p className="mb-3 text-xs text-zinc-500">
              Vence: {formatDate(user.billing.currentPeriodEnd)} · Origen: {user.billing.sourceEvent || "—"}
            </p>
          ) : null}

          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
            Servidores que gestiona ({user.managedGuildCount || user.guilds.length})
          </p>
          {user.managedGuilds.length ? (
            <div className="mb-5 grid gap-2 lg:grid-cols-2">
              {user.managedGuilds.map((guild) => (
                <GuildCard key={guild.id} guild={guild} />
              ))}
            </div>
          ) : (
            <p className="mb-5 text-sm text-zinc-500">Sin servidores administrables registrados.</p>
          )}

          {user.guilds.length > user.managedGuilds.length ? (
            <>
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
                Otros servidores vistos ({user.guilds.length - user.managedGuilds.length})
              </p>
              <div className="grid gap-2 lg:grid-cols-2">
                {user.guilds
                  .filter((guild) => !user.managedGuilds.some((managed) => managed.id === guild.id))
                  .map((guild) => (
                    <GuildCard key={guild.id} guild={guild} />
                  ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function OwnerSettings() {
  const { toast } = useToast();
  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [users, setUsers] = useState<RegistryUser[]>([]);
  const [summary, setSummary] = useState<RegistrySummary>({
    totalLogins: 0,
    uniqueUsers: 0,
    uniqueGuildsSeen: 0,
    updatedAt: "",
  });
  const [query, setQuery] = useState("");
  const [logLevel, setLogLevel] = useState("");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setRefreshing(true);
    setError(null);
    try {
      const [statsData, logsData, registryData] = await Promise.all([
        getStats(),
        getLogs({ limit: 120, level: logLevel || undefined }),
        getLoginRegistry(),
      ]);

      setStats(asRecord(statsData));
      setLogs(asArray(logsData).map((entry) => asRecord(entry)));

      const registry = asRecord(registryData);
      const summaryData = asRecord(registry.summary);
      setSummary({
        totalLogins: toNumberValue(summaryData.totalLogins),
        uniqueUsers: toNumberValue(summaryData.uniqueUsers),
        uniqueGuildsSeen: toNumberValue(summaryData.uniqueGuildsSeen),
        updatedAt: toStringValue(summaryData.updatedAt),
      });
      setUsers(asArray(registry.users).map(parseRegistryUser));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (tab !== "logs") return;
    void getLogs({ limit: 120, level: logLevel || undefined })
      .then((logsData) => setLogs(asArray(logsData).map((entry) => asRecord(entry))))
      .catch((err) => toast({ title: "No se pudieron cargar logs", description: getErrorMessage(err), tone: "danger" }));
  }, [logLevel, tab]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (user) =>
        user.username.toLowerCase().includes(q) ||
        user.globalName.toLowerCase().includes(q) ||
        user.userId.includes(q)
    );
  }, [users, query]);

  async function handleBilling(userId: string, action: string, days?: number) {
    setBillingBusy(userId);
    try {
      await updateUserBilling(userId, { action, days });
      toast({
        title: "EyedPlus+ actualizado",
        description: `Acción «${action}» aplicada al usuario.`,
        tone: "success",
      });
      const registryData = await getLoginRegistry();
      const registry = asRecord(registryData);
      setUsers(asArray(registry.users).map(parseRegistryUser));
    } catch (err) {
      toast({ title: "No se pudo actualizar Plus", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setBillingBusy(null);
    }
  }

  if (loading) return <Alert title="Cargando panel de propietario" description="Consultando usuarios, logs y estadísticas." />;
  if (error) return <Alert title="No se pudo cargar el panel de propietario" description={error} variant="danger" />;

  const memory = asRecord(stats.memory);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Crown className="h-4 w-4 text-amber-300" />
          Herramientas exclusivas del creador del bot
        </div>
        <Button variant="secondary" size="sm" onClick={() => void loadAll()} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      <Tabs items={OWNER_TABS} value={tab} onValueChange={setTab} />

      {tab === "overview" ? (
        <PaneGrid>
          <SectionCard title="Estadísticas globales" description="Estado del bot y del panel web.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Servidores", value: toStringValue(stats.guilds), icon: <Shield className="h-5 w-5" /> },
                { label: "Usuarios (cache)", value: toStringValue(stats.users), icon: <Users className="h-5 w-5" /> },
                { label: "Ping", value: `${toStringValue(stats.ping, "—")} ms`, icon: <Activity className="h-5 w-5" /> },
                { label: "Uptime", value: formatUptime(toNumberValue(stats.uptime)), icon: <Clock3 className="h-5 w-5" /> },
              ].map((item) => (
                <div key={item.label} className="rounded-3xl border border-white/10 bg-black/20 p-5">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8 text-white">{item.icon}</div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Actividad del panel" description="Usuarios que han iniciado sesión en la web.">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                <p className="text-xs text-zinc-500">Logins totales</p>
                <p className="text-xl font-semibold text-white">{summary.totalLogins}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                <p className="text-xs text-zinc-500">Usuarios únicos</p>
                <p className="text-xl font-semibold text-white">{summary.uniqueUsers}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                <p className="text-xs text-zinc-500">Servidores vistos</p>
                <p className="text-xl font-semibold text-white">{summary.uniqueGuildsSeen}</p>
              </div>
            </div>
            {summary.updatedAt ? (
              <p className="mt-4 text-xs text-zinc-500">Actualizado: {formatDate(summary.updatedAt)}</p>
            ) : null}
          </SectionCard>
        </PaneGrid>
      ) : null}

      {tab === "bots" ? <OwnerBotsTab /> : null}

      {tab === "users" ? (
        <SectionCard title="Usuarios del panel" description="Todos los usuarios que han usado la web, sus servidores y EyedPlus+.">
          <div className="mb-5 flex gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre o ID…"
                className="pl-10"
              />
            </div>
          </div>
          <div className="space-y-3">
            {filteredUsers.length ? (
              filteredUsers.map((user) => (
                <UserRow
                  key={user.userId}
                  user={user}
                  expanded={expandedUserId === user.userId}
                  onToggle={() => setExpandedUserId((current) => (current === user.userId ? null : user.userId))}
                  onBilling={(action, days) => void handleBilling(user.userId, action, days)}
                  busy={billingBusy === user.userId}
                />
              ))
            ) : (
              <Alert title="Sin resultados" description="No hay usuarios que coincidan con la búsqueda." />
            )}
          </div>
        </SectionCard>
      ) : null}

      {tab === "logs" ? (
        <SectionCard title="Logs del sistema" description="Eventos recientes capturados por el backend del panel.">
          <div className="mb-5 max-w-xs">
            <Field label="Nivel">
              <Select value={logLevel} onChange={(event) => setLogLevel(event.target.value)}>
                <option value="">Todos</option>
                <option value="info">Info</option>
                <option value="warn">Advertencias</option>
                <option value="error">Errores</option>
              </Select>
            </Field>
          </div>
          <div className="space-y-2">
            {logs.length ? (
              logs.map((log, index) => (
                <div key={`${log.timestamp}-${index}`} className="rounded-xl border border-white/8 bg-black/20 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant={toStringValue(log.level) === "error" ? "danger" : "default"}>
                      {toStringValue(log.level, "info")}
                    </Badge>
                    <span className="text-xs text-zinc-500">{formatDate(log.timestamp)}</span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-200">{toStringValue(log.message, "Evento")}</p>
                </div>
              ))
            ) : (
              <Alert title="Sin logs" description="No hay entradas con el filtro actual." />
            )}
          </div>
        </SectionCard>
      ) : null}

      {tab === "system" ? (
        <SectionCard title="Sistema del panel" description="Información del entorno y del frontend actual.">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8 text-white">
                <Globe2 className="h-5 w-5" />
              </div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Framework</p>
              <p className="mt-2 text-lg font-semibold text-white">Next.js 16</p>
              <p className="mt-1 text-sm text-zinc-500">Node {toStringValue(stats.nodeVersion, "—")}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8 text-white">
                <Palette className="h-5 w-5" />
              </div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Tema</p>
              <p className="mt-2 text-lg font-semibold text-white">Glass morphism violeta</p>
              <p className="mt-1 text-sm text-zinc-500">App Router + Turbopack</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8 text-white">
                <Cpu className="h-5 w-5" />
              </div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Memoria</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {memory.heapUsed ? `${Math.round(toNumberValue(memory.heapUsed) / 1024 / 1024)} MB` : "N/D"}
              </p>
              <p className="mt-1 text-sm text-zinc-500">{toStringValue(stats.platform, "servidor")}</p>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
