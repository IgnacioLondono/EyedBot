"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, Clock, Gavel, RefreshCw, Search, Shield, UserX } from "lucide-react";
import { getGuildBans, getGuildMembers, moderateMember, unbanMember } from "@/lib/api/endpoints";
import { useToast } from "@/components/providers/ToastProvider";
import { paneTabKey, usePersistedTab } from "@/lib/hooks/usePersistedTab";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";
import { Select } from "@/components/ui/Select";
import { Field, PaneGrid, SectionCard, Textarea } from "@/components/features/shared";
import { asArray, asRecord, formatDate, getErrorMessage, toStringValue } from "@/lib/utils";

const MOD_TABS = [
  { id: "members", label: "Miembros" },
  { id: "actions", label: "Por ID" },
  { id: "bans", label: "Bans" },
  { id: "guide", label: "Guía" },
];
const MOD_TAB_IDS = MOD_TABS.map((item) => item.id);

const TIMEOUT_PRESETS = [
  { label: "10 minutos", ms: 10 * 60 * 1000 },
  { label: "1 hora", ms: 60 * 60 * 1000 },
  { label: "6 horas", ms: 6 * 60 * 60 * 1000 },
  { label: "1 día", ms: 24 * 60 * 60 * 1000 },
  { label: "7 días", ms: 7 * 24 * 60 * 60 * 1000 },
];

type MemberItem = {
  id: string;
  name: string;
  tag: string;
  avatar: string;
  joinedAt: string;
  roles: Array<{ id: string; name: string; color?: string }>;
};

type BanItem = {
  id: string;
  name: string;
  tag: string;
  reason: string;
};

export function ModerationPane({ guildId }: { guildId: string }) {
  const { toast } = useToast();
  const [tab, setTab] = usePersistedTab(paneTabKey(guildId, "moderation"), "members", MOD_TAB_IDS);
  const [query, setQuery] = useState("");
  const [actionUserId, setActionUserId] = useState("");
  const [reason, setReason] = useState("");
  const [timeoutMs, setTimeoutMs] = useState(TIMEOUT_PRESETS[1].ms);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [bans, setBans] = useState<BanItem[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingBans, setLoadingBans] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const defaultReason = useMemo(() => "Acción ejecutada desde el panel web", []);

  async function loadMembers(nextQuery = "") {
    setLoadingMembers(true);
    setError(null);
    try {
      const payload = await getGuildMembers(guildId, nextQuery);
      setMembers(
        asArray(payload).map((entry, index) => {
          const item = asRecord(entry);
          return {
            id: toStringValue(item.id || item.userId, `user-${index}`),
            name: toStringValue(item.username || item.displayName, "Usuario"),
            tag: toStringValue(item.tag || item.username, "Usuario"),
            avatar: toStringValue(item.avatar),
            joinedAt: toStringValue(item.joinedAt),
            roles: asArray(item.roles).map((role) => {
              const row = asRecord(role);
              return {
                id: toStringValue(row.id),
                name: toStringValue(row.name, "Rol"),
                color: toStringValue(row.color),
              };
            }),
          };
        })
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingMembers(false);
    }
  }

  async function loadBans() {
    setLoadingBans(true);
    setError(null);
    try {
      const payload = await getGuildBans(guildId);
      setBans(
        asArray(payload).map((entry, index) => {
          const item = asRecord(entry);
          return {
            id: toStringValue(item.userId || item.id, `ban-${index}`),
            name: toStringValue(item.username, "Usuario"),
            tag: toStringValue(item.tag || item.username, "Desconocido"),
            reason: toStringValue(item.reason, "Sin motivo"),
          };
        })
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingBans(false);
    }
  }

  useEffect(() => {
    void loadMembers("");
  }, [guildId]);

  useEffect(() => {
    if (tab !== "members") return;
    const timer = window.setTimeout(() => {
      void loadMembers(query);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, guildId, tab]);

  useEffect(() => {
    if (tab === "bans") void loadBans();
  }, [tab, guildId]);

  async function runAction(
    memberId: string,
    action: "kick" | "ban" | "timeout" | "removeTimeout",
    options?: { duration?: number }
  ) {
    const actionKey = `${memberId}-${action}`;
    setBusy(actionKey);
    try {
      await moderateMember({
        guildId,
        userId: memberId,
        action,
        reason: reason.trim() || defaultReason,
        ...(action === "timeout" ? { duration: options?.duration ?? timeoutMs } : {}),
      });
      const labels: Record<string, string> = {
        kick: "expulsado",
        ban: "baneado",
        timeout: "silenciado (timeout)",
        removeTimeout: "liberado del timeout",
      };
      toast({
        title: "Moderación aplicada",
        description: `El usuario fue ${labels[action] || "moderado"}.`,
        tone: "success",
      });
      if (tab === "members") await loadMembers(query);
      if (tab === "bans" && action === "ban") await loadBans();
    } catch (err) {
      toast({ title: "No se pudo moderar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  async function handleUnban(userId: string) {
    setBusy(userId);
    try {
      await unbanMember(guildId, {
        userId,
        reason: reason.trim() || "Desbaneado desde el panel",
      });
      toast({ title: "Usuario desbaneado", description: "El ban fue removido.", tone: "success" });
      await loadBans();
    } catch (err) {
      toast({ title: "No se pudo desbanear", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <PaneGrid>
      <SectionCard title="Moderación" description="Gestiona miembros, aplica sanciones y revisa baneos del servidor.">
        <Tabs items={MOD_TABS} value={tab} onValueChange={setTab} className="mb-6" />

        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
            <p className="text-xs text-zinc-500">Resultados</p>
            <p className="text-xl font-semibold text-white">{members.length}</p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
            <p className="text-xs text-zinc-500">Baneos</p>
            <p className="text-xl font-semibold text-white">{bans.length || "—"}</p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
            <p className="text-xs text-zinc-500">Motivo por defecto</p>
            <p className="truncate text-sm text-zinc-300">{reason.trim() || defaultReason}</p>
          </div>
        </div>

        <Field label="Motivo de la acción" description="Se registrará en el audit log de Discord.">
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={defaultReason}
            rows={2}
          />
        </Field>

        {tab === "members" ? (
          <>
            <div className="mb-5 mt-5 flex gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por nombre o tag…"
                  className="pl-10"
                />
              </div>
              <Button variant="secondary" onClick={() => void loadMembers(query)} disabled={loadingMembers}>
                <RefreshCw className={`h-4 w-4 ${loadingMembers ? "animate-spin" : ""}`} />
              </Button>
            </div>
            {error ? <Alert title="Error" description={error} variant="danger" /> : null}
            {loadingMembers ? (
              <Alert title="Consultando miembros" description="Buscando resultados en el servidor (máx. 50)." />
            ) : members.length ? (
              <div className="space-y-3">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="rounded-2xl border border-white/8 bg-black/20 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        {member.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={member.avatar} alt="" className="h-11 w-11 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
                            <Shield className="h-5 w-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-white">{member.tag}</p>
                          <p className="text-xs text-zinc-500">{member.id}</p>
                          {member.joinedAt ? (
                            <p className="mt-1 text-xs text-zinc-600">Unió {formatDate(member.joinedAt)}</p>
                          ) : null}
                          {member.roles.length ? (
                            <p className="mt-2 truncate text-xs text-zinc-400">
                              {member.roles
                                .slice(0, 4)
                                .map((role) => role.name)
                                .join(" · ")}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void runAction(member.id, "kick")}
                          disabled={busy === `${member.id}-kick`}
                        >
                          <Gavel className="h-4 w-4" />
                          Expulsar
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => void runAction(member.id, "ban")}
                          disabled={busy === `${member.id}-ban`}
                        >
                          <Ban className="h-4 w-4" />
                          Ban
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void runAction(member.id, "timeout", { duration: timeoutMs })}
                          disabled={busy === `${member.id}-timeout`}
                        >
                          <Clock className="h-4 w-4" />
                          Timeout
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void runAction(member.id, "removeTimeout")}
                          disabled={busy === `${member.id}-removeTimeout`}
                        >
                          Quitar timeout
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Sin coincidencias" description="No encontramos miembros con ese criterio." />
            )}
          </>
        ) : null}

        {tab === "actions" ? (
          <div className="mt-5 space-y-4">
            <Field label="ID de usuario de Discord">
              <Input
                value={actionUserId}
                onChange={(event) => setActionUserId(event.target.value)}
                placeholder="123456789012345678"
              />
            </Field>
            <Field label="Duración del timeout">
              <Select
                value={String(timeoutMs)}
                onChange={(event) => setTimeoutMs(Number(event.target.value))}
              >
                {TIMEOUT_PRESETS.map((preset) => (
                  <option key={preset.ms} value={preset.ms}>
                    {preset.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => actionUserId && void runAction(actionUserId, "kick")}
                disabled={!actionUserId}
              >
                <UserX className="h-4 w-4" />
                Expulsar
              </Button>
              <Button
                variant="danger"
                onClick={() => actionUserId && void runAction(actionUserId, "ban")}
                disabled={!actionUserId}
              >
                <Ban className="h-4 w-4" />
                Ban permanente
              </Button>
              <Button
                variant="secondary"
                onClick={() => actionUserId && void runAction(actionUserId, "timeout", { duration: timeoutMs })}
                disabled={!actionUserId}
              >
                <Clock className="h-4 w-4" />
                Aplicar timeout
              </Button>
              <Button
                variant="ghost"
                onClick={() => actionUserId && void runAction(actionUserId, "removeTimeout")}
                disabled={!actionUserId}
              >
                Quitar timeout
              </Button>
            </div>
          </div>
        ) : null}

        {tab === "bans" ? (
          loadingBans ? (
            <Alert title="Cargando bans" description="Consultando usuarios baneados." />
          ) : bans.length ? (
            <div className="mt-5 space-y-3">
              {bans.map((ban) => (
                <div
                  key={ban.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-white">{ban.tag || ban.name}</p>
                    <p className="text-xs text-zinc-500">{ban.id}</p>
                    <p className="mt-1 text-sm text-zinc-400">{ban.reason}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => void handleUnban(ban.id)} disabled={busy === ban.id}>
                    Desbanear
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Shield className="h-6 w-6" />} title="Sin bans" description="No hay usuarios baneados." />
          )
        ) : null}

        {tab === "guide" ? (
          <div className="mt-5 space-y-4">
            <Alert
              title="Acciones disponibles"
              description="Expulsar saca al usuario del servidor. Ban es permanente. Timeout impide hablar temporalmente. El bot necesita permisos de moderación y jerarquía por encima del miembro."
            />
            <ul className="space-y-2 text-sm text-zinc-400">
              <li>· La búsqueda de miembros devuelve hasta 50 resultados.</li>
              <li>· No se puede moderar al dueño del servidor.</li>
              <li>· Usa «Por ID» si el usuario no aparece en la lista.</li>
              <li>· Los motivos quedan registrados en el audit log de Discord.</li>
            </ul>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Duración de timeout" description="Aplica a los botones Timeout de la pestaña Miembros.">
        <Select value={String(timeoutMs)} onChange={(event) => setTimeoutMs(Number(event.target.value))}>
          {TIMEOUT_PRESETS.map((preset) => (
            <option key={preset.ms} value={preset.ms}>
              {preset.label}
            </option>
          ))}
        </Select>
      </SectionCard>
    </PaneGrid>
  );
}
