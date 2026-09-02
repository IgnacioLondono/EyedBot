"use client";

import { useEffect, useState } from "react";
import { BarChart3, Send } from "lucide-react";
import {
  getWeeklySummaryConfig,
  saveWeeklySummaryConfig,
  sendWeeklySummaryNow,
} from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { useGuildRoles } from "@/lib/hooks/useGuildRoles";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import {
  ChannelSelect,
  Field,
  FormActions,
  PaneGrid,
  RoleSelect,
  SectionCard,
  Select,
} from "@/components/features/shared";
import { asRecord, getErrorMessage, toBooleanValue, toStringValue } from "@/lib/utils";

type WeeklySummaryState = {
  enabled: boolean;
  channelId: string;
  dayOfWeek: number;
  hour: number;
  compare: boolean;
  mentionRoleId: string;
  timezone: string;
  lastPostedDate: string;
};

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const defaultForm: WeeklySummaryState = {
  enabled: false,
  channelId: "",
  dayOfWeek: 0,
  hour: 20,
  compare: true,
  mentionRoleId: "",
  timezone: "America/Santiago",
  lastPostedDate: "",
};

function normalizeForm(value: unknown): WeeklySummaryState {
  const data = asRecord(value);
  const dayOfWeek = Number.parseInt(String(data.dayOfWeek), 10);
  const hour = Number.parseInt(String(data.hour), 10);
  return {
    enabled: toBooleanValue(data.enabled),
    channelId: toStringValue(data.channelId),
    dayOfWeek: Number.isFinite(dayOfWeek) ? Math.min(6, Math.max(0, dayOfWeek)) : 0,
    hour: Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 20,
    compare: data.compare !== false,
    mentionRoleId: toStringValue(data.mentionRoleId),
    timezone: toStringValue(data.timezone, defaultForm.timezone),
    lastPostedDate: toStringValue(data.lastPostedDate),
  };
}

export function WeeklySummaryPane({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { roles } = useGuildRoles(guildId);
  const { toast } = useToast();
  const [form, setForm] = useState<WeeklySummaryState>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getWeeklySummaryConfig(guildId)
      .then((payload) => setForm(normalizeForm(payload)))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [guildId]);

  async function handleSave() {
    if (form.enabled && !form.channelId) {
      toast({ title: "Falta el canal", description: "Selecciona un canal para el resumen.", tone: "danger" });
      return;
    }
    setSaving(true);
    try {
      await saveWeeklySummaryConfig(guildId, {
        enabled: form.enabled,
        channelId: form.channelId,
        dayOfWeek: form.dayOfWeek,
        hour: form.hour,
        compare: form.compare,
        mentionRoleId: form.mentionRoleId || null,
      });
      toast({ title: "Resumen guardado", description: "La configuración del resumen semanal fue actualizada.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSendNow() {
    setSending(true);
    try {
      await sendWeeklySummaryNow(guildId);
      toast({ title: "Resumen enviado", description: "Se publicó el resumen en el canal configurado.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo enviar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSending(false);
    }
  }

  if (loading) return <Alert title="Cargando resumen" description="Consultando la configuración actual." />;
  if (error) return <Alert title="No se pudo cargar" description={error} variant="danger" />;

  return (
    <PaneGrid>
      <SectionCard
        title="Resumen semanal"
        description="Publica automáticamente un reporte de actividad de la comunidad (miembros, mensajes, voz y top de la semana)."
      >
        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
            <div>
              <p className="font-medium text-white">Resumen habilitado</p>
              <p className="text-sm text-zinc-400">Publica el reporte de forma automática cada semana.</p>
            </div>
            <Switch checked={form.enabled} onCheckedChange={(checked) => setForm((c) => ({ ...c, enabled: checked }))} />
          </div>

          <Field label="Canal de publicación">
            <ChannelSelect
              value={form.channelId}
              onChange={(channelId) => setForm((c) => ({ ...c, channelId }))}
              options={channels}
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Día de publicación">
              <Select
                value={String(form.dayOfWeek)}
                onChange={(event) => setForm((c) => ({ ...c, dayOfWeek: Number.parseInt(event.target.value, 10) }))}
              >
                {DAYS.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Hora (local del servidor)" description={`Zona horaria: ${form.timezone}`}>
              <Select
                value={String(form.hour)}
                onChange={(event) => setForm((c) => ({ ...c, hour: Number.parseInt(event.target.value, 10) }))}
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, "0")}:00
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Mencionar rol (opcional)">
            <RoleSelect
              value={form.mentionRoleId}
              onChange={(roleId) => setForm((c) => ({ ...c, mentionRoleId: roleId }))}
              options={roles}
              placeholder="Sin mención"
            />
          </Field>

          <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
            <div>
              <p className="font-medium text-white">Comparativa vs semana pasada</p>
              <p className="text-sm text-zinc-400">Muestra el % de cambio en mensajes, voz y nuevos miembros.</p>
            </div>
            <Switch checked={form.compare} onCheckedChange={(checked) => setForm((c) => ({ ...c, compare: checked }))} />
          </div>

          <FormActions onSave={handleSave} saving={saving} />
        </div>
      </SectionCard>

      <SectionCard title="Publicar ahora" description="Envía el resumen inmediatamente sin esperar al día programado.">
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20 text-violet-50">
              <BarChart3 className="h-5 w-5" />
            </div>
            <p className="text-sm text-zinc-400">
              {form.channelId ? "Se publicará en el canal seleccionado." : "Primero selecciona y guarda un canal."}
            </p>
          </div>
          <Button disabled={!form.channelId || sending} onClick={() => void handleSendNow()}>
            <Send className="mr-2 h-4 w-4" />
            {sending ? "Enviando…" : "Enviar resumen ahora"}
          </Button>
          {form.lastPostedDate ? (
            <p className="text-xs text-zinc-500">Última publicación automática: {form.lastPostedDate}</p>
          ) : null}
        </div>
      </SectionCard>
    </PaneGrid>
  );
}
