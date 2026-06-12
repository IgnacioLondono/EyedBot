"use client";

import { useEffect, useState } from "react";
import { Ban, Gavel, Search } from "lucide-react";
import { getGuildMembers, moderateMember } from "@/lib/api/endpoints";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/features/shared";
import { asArray, asRecord, getErrorMessage, toStringValue } from "@/lib/utils";

type MemberItem = {
  id: string;
  name: string;
};

export function ModerationPane({ guildId }: { guildId: string }) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getGuildMembers(guildId, "")
      .then((payload) => {
        if (!active) return;
        const mapped = asArray(payload).map((entry, index) => {
          const item = asRecord(entry);
          return {
            id: toStringValue(item.id || item.userId, `user-${index}`),
            name: toStringValue(item.username || item.userTag || item.displayName, "Usuario"),
          };
        });
        setMembers(mapped);
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [guildId]);

  async function loadMembers(nextQuery = "") {
    setLoading(true);
    setError(null);
    try {
      const payload = await getGuildMembers(guildId, nextQuery);
      const mapped = asArray(payload).map((entry, index) => {
        const item = asRecord(entry);
        return {
          id: toStringValue(item.id || item.userId, `user-${index}`),
          name: toStringValue(item.username || item.userTag || item.displayName, "Usuario"),
        };
      });
      setMembers(mapped);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

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

  return (
    <SectionCard title="Moderación de miembros" description="Busca usuarios del servidor y ejecuta acciones directas.">
      <div className="mb-5 flex gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar miembro por nombre o ID"
            className="pl-10"
          />
        </div>
        <Button variant="secondary" onClick={() => void loadMembers(query)}>
          Buscar
        </Button>
      </div>

      {error ? <Alert title="No se pudo cargar miembros" description={error} variant="danger" /> : null}

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
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void runAction(member.id, "kick")}
                  disabled={busy === `${member.id}-kick`}
                >
                  <Gavel className="h-4 w-4" />
                  Kick
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
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Sin coincidencias" description="No encontramos miembros con ese criterio de búsqueda." />
      )}
    </SectionCard>
  );
}
