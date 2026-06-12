"use client";

import { useEffect, useMemo, useState } from "react";
import { History, Inbox, MessageSquare, Send, Unlock } from "lucide-react";
import {
  acceptTicket,
  claimTicket,
  closeTicket,
  deleteTicketReport,
  getTicketMessages,
  getTicketReport,
  getTicketsOverview,
  sendTicketMessage,
  unclaimTicket,
} from "@/lib/api/endpoints";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";
import { LineChart } from "@/components/ui/LineChart";
import { Field, Input, SectionCard, Textarea } from "@/components/features/shared";
import { asArray, asRecord, formatDate, getErrorMessage, toNumberValue, toStringValue } from "@/lib/utils";

type TicketRow = {
  id: string;
  title: string;
  owner: string;
  claimedBy?: string;
  raw: Record<string, unknown>;
};

function mapTickets(value: unknown, idKeys: string[]): TicketRow[] {
  return asArray(value).map((entry, index) => {
    const item = asRecord(entry);
    const id = idKeys.map((key) => toStringValue(item[key])).find(Boolean) || `item-${index}`;
    return {
      id,
      title: toStringValue(item.title || item.channelName || item.reason || item.topic, id),
      owner: toStringValue(item.username || item.userTag || item.ownerName || item.userId, "Sin asignar"),
      claimedBy: toStringValue(item.claimedBy || item.claimedByTag),
      raw: item,
    };
  });
}

export function TicketsManagePanel({ guildId }: { guildId: string }) {
  const { toast } = useToast();
  const [manageTab, setManageTab] = useState("pending");
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [pending, setPending] = useState<TicketRow[]>([]);
  const [active, setActive] = useState<TicketRow[]>([]);
  const [history, setHistory] = useState<TicketRow[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<Record<string, unknown>>>([]);
  const [draft, setDraft] = useState("");
  const [reportText, setReportText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const payload = asRecord(await getTicketsOverview(guildId, { historyLimit: 100 }));
      setStats(asRecord(payload.stats));
      setPending(mapTickets(payload.pending, ["requestId", "id"]));
      setActive(mapTickets(payload.active, ["channelId", "id"]));
      setHistory(mapTickets(payload.history, ["reportId", "id"]));
    } catch (err) {
      toast({ title: "Error cargando tickets", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [guildId]);

  useEffect(() => {
    if (!selectedId || manageTab !== "active") {
      setMessages([]);
      return;
    }
    void getTicketMessages(guildId, selectedId)
      .then((payload) => setMessages(asArray(asRecord(payload).messages || payload).map((m) => asRecord(m))))
      .catch(() => setMessages([]));
  }, [guildId, selectedId, manageTab]);

  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return history;
    return history.filter((item) => item.title.toLowerCase().includes(q) || item.owner.toLowerCase().includes(q));
  }, [history, historyQuery]);

  const chartLabels = asArray<Record<string, unknown>>(stats.last7Days).map((d) => toStringValue(d.date).slice(5));
  const chartSeries = [
    {
      key: "opened",
      label: "Abiertos",
      color: "#60a5fa",
      values: asArray<Record<string, unknown>>(stats.last7Days).map((d) => toNumberValue(d.opened)),
    },
    {
      key: "closed",
      label: "Cerrados",
      color: "#34d399",
      values: asArray<Record<string, unknown>>(stats.last7Days).map((d) => toNumberValue(d.closed)),
    },
  ];

  async function runAction(id: string, action: () => Promise<unknown>, label: string) {
    setBusyId(id);
    try {
      await action();
      toast({ title: label, description: "Acción completada.", tone: "success" });
      await reload();
    } catch (err) {
      toast({ title: "Error", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setBusyId(null);
    }
  }

  async function handleSendMessage() {
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    try {
      await sendTicketMessage(guildId, selectedId, { content: draft.trim() });
      setDraft("");
      const payload = await getTicketMessages(guildId, selectedId);
      setMessages(asArray(asRecord(payload).messages || payload).map((m) => asRecord(m)));
    } catch (err) {
      toast({ title: "No se pudo enviar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSending(false);
    }
  }

  async function viewReport(reportId: string) {
    try {
      const payload = asRecord(await getTicketReport(guildId, reportId));
      setReportText(toStringValue(payload.content || payload.text || JSON.stringify(payload, null, 2)));
    } catch (err) {
      toast({ title: "No se pudo abrir informe", description: getErrorMessage(err), tone: "danger" });
    }
  }

  if (loading) return <Alert title="Cargando gestión" description="Sincronizando estadísticas y tickets." />;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            { label: "Activos", value: stats.active },
            { label: "Pendientes", value: stats.pending },
            { label: "Cerrados", value: stats.closed },
            { label: "Sin asignar", value: stats.unclaimed },
          ] as const
        ).map((item) => (
          <div key={item.label} className="rounded-2xl border border-white/8 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{toNumberValue(item.value)}</p>
          </div>
        ))}
      </div>

      {chartLabels.length ? (
        <SectionCard title="Tendencia 7 días" description="Tickets abiertos y cerrados por día.">
          <LineChart labels={chartLabels} series={chartSeries} />
        </SectionCard>
      ) : null}

      <Tabs
        items={[
          { id: "pending", label: "Pendientes" },
          { id: "active", label: "Activos" },
          { id: "history", label: "Historial" },
        ]}
        value={manageTab}
        onValueChange={setManageTab}
        className="mb-4"
      />

      {manageTab === "pending" ? (
        pending.length ? (
          <div className="space-y-3">
            {pending.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{item.title}</p>
                    <p className="text-sm text-zinc-400">{item.owner}</p>
                  </div>
                  <Button size="sm" disabled={busyId === item.id} onClick={() => void runAction(item.id, () => acceptTicket(guildId, item.id), "Aceptado")}>
                    Aceptar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Inbox className="h-6 w-6" />} title="Nada pendiente" description="No hay solicitudes nuevas." />
        )
      ) : null}

      {manageTab === "active" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
          <div className="space-y-3">
            {active.length ? (
              active.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedId === item.id ? "border-violet-400/50 bg-violet-500/10" : "border-white/8 bg-black/20"
                  }`}
                >
                  <p className="font-medium text-white">{item.title}</p>
                  <p className="text-sm text-zinc-400">{item.owner}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {item.claimedBy ? `Reclamado por ${item.claimedBy}` : "Sin asignar"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === item.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        void runAction(item.id, () => claimTicket(guildId, item.id), "Reclamado");
                      }}
                    >
                      Reclamar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === item.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        void runAction(item.id, () => unclaimTicket(guildId, item.id), "Liberado");
                      }}
                    >
                      <Unlock className="mr-1 h-3.5 w-3.5" />
                      Liberar
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busyId === item.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        void runAction(item.id, () => closeTicket(guildId, item.id, {}), "Cerrado");
                      }}
                    >
                      Cerrar
                    </Button>
                  </div>
                </button>
              ))
            ) : (
              <EmptyState icon={<MessageSquare className="h-6 w-6" />} title="Sin activos" description="No hay tickets abiertos." />
            )}
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
            <h4 className="mb-3 font-medium text-white">Chat del ticket</h4>
            {selectedId ? (
              <>
                <div className="mb-4 max-h-80 space-y-2 overflow-y-auto">
                  {messages.length ? (
                    messages.map((msg, index) => (
                      <div key={`${msg.id ?? index}`} className="rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-sm">
                        <p className="text-xs text-zinc-500">{toStringValue(msg.authorTag || msg.author, "Staff")}</p>
                        <p className="text-zinc-200">{toStringValue(msg.content, "")}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-500">Sin mensajes en este ticket.</p>
                  )}
                </div>
                <Field label="Mensaje al canal de Discord">
                  <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} />
                </Field>
                <Button className="mt-3" onClick={() => void handleSendMessage()} disabled={sending || !draft.trim()}>
                  <Send className="mr-2 h-4 w-4" />
                  {sending ? "Enviando..." : "Enviar"}
                </Button>
              </>
            ) : (
              <p className="text-sm text-zinc-500">Selecciona un ticket activo para chatear.</p>
            )}
          </div>
        </div>
      ) : null}

      {manageTab === "history" ? (
        <div className="space-y-4">
          <Field label="Buscar en historial">
            <Input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Usuario, canal o motivo" />
          </Field>
          {filteredHistory.length ? (
            <div className="space-y-3">
              {filteredHistory.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{item.title}</p>
                      <p className="text-sm text-zinc-400">{item.owner}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {formatDate(item.raw.createdAt || item.raw.closedAt)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => void viewReport(item.id)}>
                        <History className="mr-1 h-3.5 w-3.5" />
                        Ver informe
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busyId === item.id}
                        onClick={() => void runAction(item.id, () => deleteTicketReport(guildId, item.id), "Informe borrado")}
                      >
                        Borrar
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Historial vacío" description="No hay informes cerrados para mostrar." />
          )}
          {reportText ? (
            <div className="rounded-2xl border border-white/8 bg-black/30 p-4">
              <p className="mb-2 text-sm font-medium text-white">Comprobante</p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-zinc-300">{reportText}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
