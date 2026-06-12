"use client";

import { useEffect, useState } from "react";
import { Inbox, MessageSquareMore, Ticket } from "lucide-react";
import { acceptTicket, claimTicket, closeTicket, getTicketsOverview } from "@/lib/api/endpoints";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PremiumLock, SectionCard } from "@/components/features/shared";
import { usePanel } from "@/components/providers/PanelProvider";
import { asArray, asRecord, getErrorMessage, toStringValue } from "@/lib/utils";

type TicketItem = {
  id: string;
  title: string;
  owner: string;
};

function normalizeTickets(value: unknown, idKeys: string[]): TicketItem[] {
  return asArray(value).map((entry, index) => {
    const item = asRecord(entry);
    const id = idKeys.map((key) => toStringValue(item[key])).find(Boolean) || `item-${index}`;
    return {
      id,
      title: toStringValue(item.title || item.channelName || item.reason || item.topic, id),
      owner: toStringValue(item.username || item.userTag || item.owner || item.userId, "Sin asignar"),
    };
  });
}

export function TicketsPane({ guildId }: { guildId: string }) {
  const { toast } = useToast();
  const { hasPremium } = usePanel();
  const [pending, setPending] = useState<TicketItem[]>([]);
  const [active, setActive] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getTicketsOverview(guildId)
      .then((raw) => {
        if (!active) return;
        const payload = asRecord(raw);
        setPending(normalizeTickets(payload.pending, ["requestId", "id"]));
        setActive(normalizeTickets(payload.active, ["channelId", "id"]));
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

  async function runAction(id: string, action: () => Promise<unknown>, label: string) {
    setBusyId(id);
    try {
      await action();
      toast({ title: label, description: "La acción se ejecutó correctamente.", tone: "success" });
      const payload = asRecord(await getTicketsOverview(guildId));
      setPending(normalizeTickets(payload.pending, ["requestId", "id"]));
      setActive(normalizeTickets(payload.active, ["channelId", "id"]));
    } catch (err) {
      toast({ title: "No se pudo completar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <Alert title="No se pudo cargar tickets" description={error} variant="danger" />;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <SectionCard
        title="Solicitudes pendientes"
        description="Acepta nuevas solicitudes de ticket desde el panel."
        action={<PremiumLock locked={!hasPremium} />}
      >
        {!hasPremium ? (
          <EmptyState
            icon={<Ticket className="h-6 w-6" />}
            title="Tickets avanzados bloqueados"
            description="Necesitas EyedPlus+ para operar solicitudes y sesiones desde el panel."
            premium
          />
        ) : loading ? (
          <Alert title="Cargando pendientes" description="Consultando solicitudes entrantes." />
        ) : pending.length ? (
          <div className="space-y-3">
            {pending.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{item.title}</p>
                    <p className="text-sm text-zinc-400">{item.owner}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() =>
                      void runAction(item.id, () => acceptTicket(guildId, item.id), "Solicitud aceptada")
                    }
                    disabled={busyId === item.id}
                  >
                    Aceptar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Inbox className="h-6 w-6" />} title="Nada pendiente" description="No hay nuevas solicitudes de ticket por revisar." />
        )}
      </SectionCard>

      <SectionCard title="Tickets activos" description="Gestiona tickets abiertos: reclamar o cerrar.">
        {loading ? (
          <Alert title="Cargando tickets activos" description="Sincronizando conversaciones abiertas." />
        ) : active.length ? (
          <div className="space-y-3">
            {active.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{item.title}</p>
                    <p className="text-sm text-zinc-400">{item.owner}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void runAction(item.id, () => claimTicket(guildId, item.id), "Ticket reclamado")
                      }
                      disabled={busyId === item.id || !hasPremium}
                    >
                      Reclamar
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        void runAction(item.id, () => closeTicket(guildId, item.id, {}), "Ticket cerrado")
                      }
                      disabled={busyId === item.id || !hasPremium}
                    >
                      Cerrar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<MessageSquareMore className="h-6 w-6" />}
            title="Sin tickets activos"
            description="Cuando haya conversaciones abiertas aparecerán aquí."
          />
        )}
      </SectionCard>
    </div>
  );
}
