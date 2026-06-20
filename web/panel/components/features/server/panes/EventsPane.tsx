"use client";

import { useEffect, useState } from "react";
import { Calendar, Gift, RefreshCw } from "lucide-react";
import {
  cancelServerEvent,
  createGiveaway,
  createServerEvent,
  endGiveaway,
  getEventsGiveawaysConfig,
  listGiveaways,
  listServerEvents,
  rerollGiveaway,
  saveEventsGiveawaysConfig,
} from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { useGuildRoles } from "@/lib/hooks/useGuildRoles";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Switch } from "@/components/ui/Switch";
import {
  ChannelSelect,
  ColorInput,
  Field,
  FormActions,
  Input,
  MultiRoleSelect,
  RoleSelect,
  SectionCard,
  Textarea,
} from "@/components/features/shared";
import { asArray, asRecord, getErrorMessage, toBooleanValue, toStringValue } from "@/lib/utils";

type ModuleConfig = {
  enabled: boolean;
  defaultChannelId: string;
  color: string;
  managerRoleIds: string[];
  reminderMinutesBefore: number;
};

type GiveawayRow = {
  id: string;
  title: string;
  prize: string;
  status: string;
  entries: string[];
  winners: string[];
  endsAt: string;
  channelId: string;
};

type EventRow = {
  id: string;
  title: string;
  description: string;
  location: string;
  startAt: string;
  status: string;
  channelId: string;
};

const TABS = [
  { id: "giveaways", label: "Sorteos" },
  { id: "events", label: "Eventos" },
  { id: "config", label: "Configuración" },
];

function normalizeConfig(value: unknown): ModuleConfig {
  const data = asRecord(value);
  return {
    enabled: toBooleanValue(data.enabled, true),
    defaultChannelId: toStringValue(data.defaultChannelId),
    color: toStringValue(data.color, "a78bfa"),
    managerRoleIds: asArray(data.managerRoleIds).map((id) => toStringValue(id)).filter(Boolean),
    reminderMinutesBefore: Number.parseInt(String(data.reminderMinutesBefore ?? 60), 10) || 60,
  };
}

function normalizeGiveaway(value: unknown): GiveawayRow {
  const data = asRecord(value);
  return {
    id: toStringValue(data.id),
    title: toStringValue(data.title, "Sorteo"),
    prize: toStringValue(data.prize),
    status: toStringValue(data.status, "active"),
    entries: asArray(data.entries).map((id) => toStringValue(id)).filter(Boolean),
    winners: asArray(data.winners).map((id) => toStringValue(id)).filter(Boolean),
    endsAt: toStringValue(data.endsAt),
    channelId: toStringValue(data.channelId),
  };
}

function normalizeEvent(value: unknown): EventRow {
  const data = asRecord(value);
  return {
    id: toStringValue(data.id),
    title: toStringValue(data.title, "Evento"),
    description: toStringValue(data.description),
    location: toStringValue(data.location),
    startAt: toStringValue(data.startAt),
    status: toStringValue(data.status, "scheduled"),
    channelId: toStringValue(data.channelId),
  };
}

export function EventsPane({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { roles } = useGuildRoles(guildId);
  const { toast } = useToast();
  const [tab, setTab] = useState("giveaways");
  const [config, setConfig] = useState<ModuleConfig>({
    enabled: true,
    defaultChannelId: "",
    color: "a78bfa",
    managerRoleIds: [],
    reminderMinutesBefore: 60,
  });
  const [giveaways, setGiveaways] = useState<GiveawayRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [giveawayForm, setGiveawayForm] = useState({
    title: "Sorteo",
    prize: "",
    description: "",
    durationMinutes: 60,
    winnersCount: 1,
    channelId: "",
    requiredRoleId: "",
  });

  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    location: "",
    startAt: "",
    channelId: "",
  });

  async function reloadLists() {
    const [giveawayPayload, eventsPayload] = await Promise.all([
      listGiveaways(guildId),
      listServerEvents(guildId),
    ]);
    setGiveaways(asArray(giveawayPayload?.giveaways).map(normalizeGiveaway));
    setEvents(asArray(eventsPayload?.events).map(normalizeEvent));
  }

  useEffect(() => {
    void Promise.all([getEventsGiveawaysConfig(guildId), reloadLists()])
      .then(([cfg]) => {
        const normalized = normalizeConfig(cfg);
        setConfig(normalized);
        setGiveawayForm((current) => ({
          ...current,
          channelId: current.channelId || normalized.defaultChannelId,
        }));
        setEventForm((current) => ({
          ...current,
          channelId: current.channelId || normalized.defaultChannelId,
        }));
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [guildId]);

  async function handleSaveConfig() {
    setSaving(true);
    try {
      const result = asRecord(await saveEventsGiveawaysConfig(guildId, config));
      setConfig(normalizeConfig(result.config ?? config));
      toast({ title: "Configuración guardada", description: "Eventos y sorteos actualizados.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateGiveaway() {
    setBusyId("create-giveaway");
    try {
      await createGiveaway(guildId, giveawayForm);
      await reloadLists();
      toast({ title: "Sorteo creado", description: "Se publicó en Discord con botón de participación.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo crear", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreateEvent() {
    setBusyId("create-event");
    try {
      await createServerEvent(guildId, { ...eventForm, publish: true });
      await reloadLists();
      toast({ title: "Evento publicado", description: "El anuncio quedó en el canal seleccionado.", tone: "success" });
      setEventForm((current) => ({ ...current, title: "", description: "", location: "", startAt: "" }));
    } catch (err) {
      toast({ title: "No se pudo publicar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Alert title="Cargando eventos y sorteos" description="Consultando el módulo." />;
  if (error) return <Alert title="No se pudo cargar" description={error} variant="danger" />;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Eventos y sorteos"
        description="Crea sorteos con botón de participación y anuncia eventos con recordatorios automáticos."
      >
        <Tabs items={TABS} value={tab} onValueChange={setTab} className="mb-5" />

        {tab === "giveaways" ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4 rounded-2xl border border-white/8 bg-black/20 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Gift className="h-4 w-4 text-violet-300" />
                Nuevo sorteo
              </h3>
              <Field label="Título">
                <Input value={giveawayForm.title} onChange={(e) => setGiveawayForm((c) => ({ ...c, title: e.target.value }))} />
              </Field>
              <Field label="Premio">
                <Input value={giveawayForm.prize} onChange={(e) => setGiveawayForm((c) => ({ ...c, prize: e.target.value }))} />
              </Field>
              <Field label="Descripción">
                <Textarea value={giveawayForm.description} onChange={(e) => setGiveawayForm((c) => ({ ...c, description: e.target.value }))} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Duración (min)">
                  <Input
                    type="number"
                    min={5}
                    value={giveawayForm.durationMinutes}
                    onChange={(e) => setGiveawayForm((c) => ({ ...c, durationMinutes: Number(e.target.value) || 60 }))}
                  />
                </Field>
                <Field label="Ganadores">
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={giveawayForm.winnersCount}
                    onChange={(e) => setGiveawayForm((c) => ({ ...c, winnersCount: Number(e.target.value) || 1 }))}
                  />
                </Field>
              </div>
              <Field label="Canal">
                <ChannelSelect
                  value={giveawayForm.channelId}
                  onChange={(channelId) => setGiveawayForm((c) => ({ ...c, channelId }))}
                  options={channels}
                />
              </Field>
              <Field label="Rol requerido" description="Opcional">
                <RoleSelect
                  value={giveawayForm.requiredRoleId}
                  onChange={(requiredRoleId) => setGiveawayForm((c) => ({ ...c, requiredRoleId }))}
                  options={roles}
                  placeholder="Sin rol requerido"
                />
              </Field>
              <Button disabled={busyId === "create-giveaway" || !giveawayForm.prize.trim()} onClick={() => void handleCreateGiveaway()}>
                {busyId === "create-giveaway" ? "Publicando..." : "Publicar sorteo"}
              </Button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Sorteos recientes</h3>
                <Button size="sm" variant="ghost" onClick={() => void reloadLists()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Actualizar
                </Button>
              </div>
              {giveaways.length === 0 ? (
                <p className="text-sm text-zinc-500">Aún no hay sorteos en este servidor.</p>
              ) : (
                giveaways.slice(0, 12).map((row) => (
                  <div key={row.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-white">{row.title}</p>
                        <p className="text-sm text-zinc-400">{row.prize}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {row.status} · {row.entries.length} participantes · ID {row.id.slice(0, 8)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {row.status === "active" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyId === row.id}
                            onClick={() => {
                              setBusyId(row.id);
                              void endGiveaway(guildId, row.id)
                                .then(() => reloadLists())
                                .then(() => toast({ title: "Sorteo finalizado", tone: "success" }))
                                .catch((err) => toast({ title: "Error", description: getErrorMessage(err), tone: "danger" }))
                                .finally(() => setBusyId(null));
                            }}
                          >
                            Terminar
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId === row.id}
                            onClick={() => {
                              setBusyId(row.id);
                              void rerollGiveaway(guildId, row.id)
                                .then(() => reloadLists())
                                .then(() => toast({ title: "Reroll hecho", tone: "success" }))
                                .catch((err) => toast({ title: "Error", description: getErrorMessage(err), tone: "danger" }))
                                .finally(() => setBusyId(null));
                            }}
                          >
                            Reroll
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

        {tab === "events" ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4 rounded-2xl border border-white/8 bg-black/20 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Calendar className="h-4 w-4 text-violet-300" />
                Nuevo evento
              </h3>
              <Field label="Título">
                <Input value={eventForm.title} onChange={(e) => setEventForm((c) => ({ ...c, title: e.target.value }))} />
              </Field>
              <Field label="Descripción">
                <Textarea value={eventForm.description} onChange={(e) => setEventForm((c) => ({ ...c, description: e.target.value }))} />
              </Field>
              <Field label="Lugar / enlace">
                <Input value={eventForm.location} onChange={(e) => setEventForm((c) => ({ ...c, location: e.target.value }))} />
              </Field>
              <Field label="Inicio" description="Formato datetime-local o ISO">
                <Input
                  type="datetime-local"
                  value={eventForm.startAt}
                  onChange={(e) => setEventForm((c) => ({ ...c, startAt: e.target.value }))}
                />
              </Field>
              <Field label="Canal">
                <ChannelSelect
                  value={eventForm.channelId}
                  onChange={(channelId) => setEventForm((c) => ({ ...c, channelId }))}
                  options={channels}
                />
              </Field>
              <Button disabled={busyId === "create-event" || !eventForm.title.trim() || !eventForm.startAt} onClick={() => void handleCreateEvent()}>
                {busyId === "create-event" ? "Publicando..." : "Publicar evento"}
              </Button>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-white">Eventos del servidor</h3>
              {events.length === 0 ? (
                <p className="text-sm text-zinc-500">No hay eventos registrados.</p>
              ) : (
                events.slice(0, 12).map((row) => (
                  <div key={row.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                    <p className="font-medium text-white">{row.title}</p>
                    <p className="text-sm text-zinc-400">{row.description || "Sin descripción"}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {row.status} · {row.startAt ? new Date(row.startAt).toLocaleString("es-ES") : "—"} · ID {row.id.slice(0, 8)}
                    </p>
                    {row.status !== "cancelled" && row.status !== "completed" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-3"
                        disabled={busyId === row.id}
                        onClick={() => {
                          setBusyId(row.id);
                          void cancelServerEvent(guildId, row.id)
                            .then(() => reloadLists())
                            .then(() => toast({ title: "Evento cancelado", tone: "success" }))
                            .catch((err) => toast({ title: "Error", description: getErrorMessage(err), tone: "danger" }))
                            .finally(() => setBusyId(null));
                        }}
                      >
                        Cancelar
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

        {tab === "config" ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
              <div>
                <p className="font-medium text-white">Módulo activo</p>
                <p className="text-sm text-zinc-400">Permite sorteos y eventos en este servidor.</p>
              </div>
              <Switch checked={config.enabled} onCheckedChange={(enabled) => setConfig((c) => ({ ...c, enabled }))} />
            </div>
            <Field label="Canal por defecto">
              <ChannelSelect
                value={config.defaultChannelId}
                onChange={(defaultChannelId) => setConfig((c) => ({ ...c, defaultChannelId }))}
                options={channels}
              />
            </Field>
            <Field label="Color de embeds">
              <ColorInput value={config.color} onChange={(color) => setConfig((c) => ({ ...c, color }))} />
            </Field>
            <Field label="Recordatorio antes del evento (min)">
              <Input
                type="number"
                min={5}
                max={1440}
                value={config.reminderMinutesBefore}
                onChange={(e) => setConfig((c) => ({ ...c, reminderMinutesBefore: Number(e.target.value) || 60 }))}
              />
            </Field>
            <Field label="Roles gestores" description="Opcional. Quién puede usar /sorteo y /evento además del staff.">
              <MultiRoleSelect
                value={config.managerRoleIds}
                onChange={(managerRoleIds) => setConfig((c) => ({ ...c, managerRoleIds }))}
                options={roles}
              />
            </Field>
            <FormActions onSave={handleSaveConfig} saving={saving} />
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
