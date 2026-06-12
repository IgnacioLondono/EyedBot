"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Ban, Gavel, Search, Shield } from "lucide-react";
import { getGuildBans, getGuildMembers, moderateMember, unbanMember } from "@/lib/api/endpoints";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";
import { SectionCard } from "@/components/features/shared";
import { asArray, asRecord, getErrorMessage, toStringValue } from "@/lib/utils";

const MOD_TABS = [
  { id: "members", label: "Miembros" },
  { id: "actions", label: "Acciones" },
  { id: "bans", label: "Bans" },
  { id: "guide", label: "Guía" },
];

type MemberItem = { id: string; name: string };
type BanItem = { id: string; reason: string };

export function ModerationPane({ guildId }: { guildId: string }) {
  const { toast } = useToast();
  const [tab, setTab] = useState("members");
  const [query, setQuery] = useState("");
  const [actionUserId, setActionUserId] = useState("");
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [bans, setBans] = useState<BanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadMembers(nextQuery = "") {
    setLoading(true);
    setError(null);
    try {
      const payload = await getGuildMembers(guildId, nextQuery);
      setMembers(
        asArray(payload).map((entry, index) => {
          const item = asRecord(entry);
          return {
            id: toStringValue(item.id || item.userId, `user-${index}`),
            name: toStringValue(item.username || item.userTag || item.displayName, "Usuario"),
          };
        })
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadBans() {
    setLoading(true);
    try {
      const payload = await getGuildBans(guildId);
      setBans(
        asArray(payload).map((entry, index) => {
          const item = asRecord(entry);
          return {
            id: toStringValue(item.userId || item.id, `ban-${index}`),
            reason: toStringValue(item.reason, "Sin motivo"),
          };
        })
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMembers("");
  }, [guildId]);

  useEffect(() => {
    if (tab === "bans") void loadBans();
  }, [tab, guildId]);

  async function runAction(memberId: string, action: "ban" | "kick") {
    setBusy(`${memberId}-${action}`);
    try {
      await moderateMember({ guildId, userId: memberId, action, reason: "Acción ejecutada desde el panel" });
      toast({ title: `Miembro ${action === "ban" ? "baneado" : "expulsado"}`, description: "La moderación se aplicó correctamente.", tone: "success" });
      await loadMembers(query);
    } catch (err) {
      toast({ title: "No se pudo moderar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  async function handleUnban(userId: string) {
    setBusy(userId);
    try {
      await unbanMember(guildId, { userId, reason: "Desbaneado desde el panel" });
      toast({ title: "Usuario desbaneado", description: "El ban fue removido.", tone: "success" });
      await loadBans();
    } catch (err) {
      toast({ title: "No se pudo desbanear", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <SectionCard title="Moderación" description="Miembros, acciones rápidas, bans y guía del módulo legacy.">
      <Tabs items={MOD_TABS} value={tab} onValueChange={setTab} className="mb-6" />

      {tab === "members" ? (
        <>
          <div className="mb-5 flex gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar miembro" className="pl-10" />
            </div>
            <Button variant="secondary" onClick={() => void loadMembers(query)}>
              Buscar
            </Button>
          </div>
          {error ? <Alert title="Error" description={error} variant="danger" /> : null}
          {loading ? (
            <Alert title="Consultando miembros" description="Buscando resultados en el servidor." />
          ) : members.length ? (
            <div className="space-y-3">
              {members.map((member) => (
                <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                  <div>
                    <p className="font-medium text-white">{member.name}</p>
                    <p className="text-sm text-zinc-500">{member.id}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => void runAction(member.id, "kick")} disabled={busy === `${member.id}-kick`}>
                      <Gavel className="h-4 w-4" />
                      Kick
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => void runAction(member.id, "ban")} disabled={busy === `${member.id}-ban`}>
                      <Ban className="h-4 w-4" />
                      Ban
                    </Button>
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
        <div className="space-y-4">
          <FieldLike label="ID de usuario">
            <Input value={actionUserId} onChange={(event) => setActionUserId(event.target.value)} placeholder="Discord user ID" />
          </FieldLike>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => actionUserId && void runAction(actionUserId, "kick")} disabled={!actionUserId}>
              Expulsar por ID
            </Button>
            <Button variant="danger" onClick={() => actionUserId && void runAction(actionUserId, "ban")} disabled={!actionUserId}>
              Banear por ID
            </Button>
          </div>
        </div>
      ) : null}

      {tab === "bans" ? (
        loading ? (
          <Alert title="Cargando bans" description="Consultando usuarios baneados." />
        ) : bans.length ? (
          <div className="space-y-3">
            {bans.map((ban) => (
              <div key={ban.id} className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                <div>
                  <p className="font-medium text-white">{ban.id}</p>
                  <p className="text-sm text-zinc-400">{ban.reason}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => void handleUnban(ban.id)} disabled={busy === ban.id}>
                  Desbanear
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Shield className="h-6 w-6" />} title="Sin bans" description="No hay usuarios baneados registrados." />
        )
      ) : null}

      {tab === "guide" ? (
        <Alert
          title="Guía de moderación"
          description="Usa Miembros para buscar y actuar, Acciones para IDs directos y Bans para revertir sanciones permanentes."
        />
      ) : null}
    </SectionCard>
  );
}

function FieldLike({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-300">{label}</p>
      {children}
    </div>
  );
}
