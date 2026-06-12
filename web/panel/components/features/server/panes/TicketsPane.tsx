"use client";

import { useEffect, useState } from "react";
import { Inbox, MessageSquareMore, Settings2, Ticket } from "lucide-react";
import {
  acceptTicket,
  claimTicket,
  closeTicket,
  getTicketConfig,
  getTicketsOverview,
  publishTickets,
  saveTicketConfig,
} from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";
import { Switch } from "@/components/ui/Switch";
import {
  ChannelSelect,
  Field,
  FormActions,
  Input,
  LockedOverlay,
  PremiumLock,
  SectionCard,
  Textarea,
} from "@/components/features/shared";
import { usePanel } from "@/components/providers/PanelProvider";
import { asArray, asRecord, getErrorMessage, toBooleanValue, toStringValue } from "@/lib/utils";

const TICKET_TABS = [
  { id: "panel", label: "Panel" },
  { id: "roles", label: "Roles" },
  { id: "manage", label: "Gestión" },
  { id: "guide", label: "Guía" },
];

type TicketItem = { id: string; title: string; owner: string };

type TicketConfigState = {
  enabled: boolean;
  panelChannelId: string;
  title: string;
  message: string;
  buttonLabel: string;
  adminRoleIds: string;
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
  const { channels } = useGuildChannels(guildId);
  const [tab, setTab] = useState("manage");
  const [config, setConfig] = useState<TicketConfigState>({
    enabled: false,
    panelChannelId: "",
    title: "Soporte",
    message: "",
    buttonLabel: "Solicitar ticket",
    adminRoleIds: "",
  });
  const [pending, setPending] = useState<TicketItem[]>([]);
  const [active, setActive] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reloadOverview() {
    const payload = asRecord(await getTicketsOverview(guildId));
    setPending(normalizeTickets(payload.pending, ["requestId", "id"]));
    setActive(normalizeTickets(payload.active, ["channelId", "id"]));
  }

  useEffect(() => {
    let mounted = true;
    void Promise.all([getTicketConfig(guildId).catch(() => ({})), getTicketsOverview(guildId).catch(() => ({}))])
      .then(([configData, overviewData]) => {
        if (!mounted) return;
        const cfg = asRecord(configData);
        setConfig({
          enabled: toBooleanValue(cfg.enabled),
          panelChannelId: toStringValue(cfg.panelChannelId || cfg.channelId),
          title: toStringValue(cfg.title, "Soporte"),
          message: toStringValue(cfg.message),
          buttonLabel: toStringValue(cfg.buttonLabel, "Solicitar ticket"),
          adminRoleIds: asArray(cfg.adminRoleIds).map((id) => toStringValue(id)).filter(Boolean).join(", "),
        });
        const payload = asRecord(overviewData);
        setPending(normalizeTickets(payload.pending, ["requestId", "id"]));
        setActive(normalizeTickets(payload.active, ["channelId", "id"]));
      })
      .catch((err) => {
        if (mounted) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [guildId]);

  async function handleSaveConfig() {
    setSaving(true);
    try {
      await saveTicketConfig(guildId, {
        ...config,
        adminRoleIds: config.adminRoleIds
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      });
      toast({ title: "Tickets guardados", description: "La configuración del panel quedó actualizada.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      await publishTickets(guildId, config);
      toast({ title: "Panel publicado", description: "El mensaje de tickets se envió al canal.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo publicar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setPublishing(false);
    }
  }

  async function runAction(id: string, action: () => Promise<unknown>, label: string) {
    setBusyId(id);
    try {
      await action();
      toast({ title: label, description: "La acción se ejecutó correctamente.", tone: "success" });
      await reloadOverview();
    } catch (err) {
      toast({ title: "No se pudo completar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <Alert title="No se pudo cargar tickets" description={error} variant="danger" />;

  return (
    <div className="relative space-y-5">
      <LockedOverlay
        visible={!hasPremium}
        title="Tickets premium"
        description="Configura y gestiona tickets con EyedPlus+."
      />

      <SectionCard
        title="Gestión de tickets"
        description="Equivalente al panel legacy con pestañas de panel, roles y operación."
        action={<PremiumLock locked={!hasPremium} />}
      >
        <Tabs items={TICKET_TABS} value={tab} onValueChange={setTab} className="mb-6" />

        <div className={!hasPremium ? "pointer-events-none opacity-50" : ""}>
          {tab === "panel" ? (
            loading ? (
              <Alert title="Cargando panel" description="Consultando configuración de tickets." />
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div>
                    <p className="font-medium text-white">Sistema de tickets</p>
                    <p className="text-sm text-zinc-400">Habilita el panel de solicitudes.</p>
                  </div>
                  <Switch checked={config.enabled} onCheckedChange={(checked) => setConfig((c) => ({ ...c, enabled: checked }))} />
                </div>
                <Field label="Canal del panel">
                  <ChannelSelect
                    value={config.panelChannelId}
                    onChange={(panelChannelId) => setConfig((c) => ({ ...c, panelChannelId }))}
                    options={channels}
                  />
                </Field>
                <Field label="Título del embed">
                  <Input value={config.title} onChange={(event) => setConfig((c) => ({ ...c, title: event.target.value }))} />
                </Field>
                <Field label="Mensaje">
                  <Textarea value={config.message} onChange={(event) => setConfig((c) => ({ ...c, message: event.target.value }))} />
                </Field>
                <Field label="Texto del botón">
                  <Input value={config.buttonLabel} onChange={(event) => setConfig((c) => ({ ...c, buttonLabel: event.target.value }))} />
                </Field>
                <div className="flex flex-wrap gap-3">
                  <FormActions onSave={handleSaveConfig} saving={saving} />
                  <Button variant="secondary" onClick={() => void handlePublish()} disabled={publishing}>
                    {publishing ? "Publicando..." : "Publicar panel"}
                  </Button>
                </div>
              </div>
            )
          ) : null}

          {tab === "roles" ? (
            <div className="space-y-5">
              <Field label="Roles de staff" description="IDs separados por coma con permiso para gestionar tickets.">
                <Textarea
                  value={config.adminRoleIds}
                  onChange={(event) => setConfig((c) => ({ ...c, adminRoleIds: event.target.value }))}
                  placeholder="123..., 456..."
                />
              </Field>
              <FormActions onSave={handleSaveConfig} saving={saving} />
            </div>
          ) : null}

          {tab === "manage" ? (
            <div className="grid gap-5 xl:grid-cols-2">
              <div>
                <h3 className="mb-3 flex items-center gap-2 font-medium text-white">
                  <Inbox className="h-4 w-4" />
                  Pendientes
                </h3>
                {loading ? (
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
                            onClick={() => void runAction(item.id, () => acceptTicket(guildId, item.id), "Solicitud aceptada")}
                            disabled={busyId === item.id}
                          >
                            Aceptar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={<Ticket className="h-6 w-6" />} title="Nada pendiente" description="No hay solicitudes nuevas." />
                )}
              </div>

              <div>
                <h3 className="mb-3 flex items-center gap-2 font-medium text-white">
                  <MessageSquareMore className="h-4 w-4" />
                  Activos
                </h3>
                {loading ? (
                  <Alert title="Cargando activos" description="Sincronizando conversaciones abiertas." />
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
                              onClick={() => void runAction(item.id, () => claimTicket(guildId, item.id), "Ticket reclamado")}
                              disabled={busyId === item.id}
                            >
                              Reclamar
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => void runAction(item.id, () => closeTicket(guildId, item.id, {}), "Ticket cerrado")}
                              disabled={busyId === item.id}
                            >
                              Cerrar
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={<Settings2 className="h-6 w-6" />} title="Sin tickets activos" description="Cuando haya conversaciones abiertas aparecerán aquí." />
                )}
              </div>
            </div>
          ) : null}

          {tab === "guide" ? (
            <Alert
              title="Flujo recomendado"
              description="1) Configura panel y roles. 2) Publica el embed. 3) Gestiona pendientes y activos desde la pestaña Gestión."
            />
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
