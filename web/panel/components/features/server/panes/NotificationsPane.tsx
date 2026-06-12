"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import {
  getStreamAlertConfig,
  saveStreamAlertConfig,
  testStreamAlert,
} from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Tabs } from "@/components/ui/Tabs";
import { Switch } from "@/components/ui/Switch";
import {
  ChannelSelect,
  Field,
  FormActions,
  Input,
  PaneGrid,
  SectionCard,
  Textarea,
} from "@/components/features/shared";
import { asRecord, getErrorMessage, toBooleanValue, toStringValue } from "@/lib/utils";

type NotificationState = {
  enabled: boolean;
  channelId: string;
  streamerName: string;
  message: string;
};

export function NotificationsPane({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { toast } = useToast();
  const [tab, setTab] = useState("stream");
  const [form, setForm] = useState<NotificationState>({
    enabled: false,
    channelId: "",
    streamerName: "",
    message: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getStreamAlertConfig(guildId)
      .then((payload) => {
        const data = asRecord(payload);
        setForm({
          enabled: toBooleanValue(data.enabled),
          channelId: toStringValue(data.channelId),
          streamerName: toStringValue(data.streamerName || data.username),
          message: toStringValue(data.message || data.template),
        });
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [guildId]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveStreamAlertConfig(guildId, form);
      toast({ title: "Alertas guardadas", description: "La notificación de stream fue actualizada.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      await testStreamAlert(guildId, form);
      toast({ title: "Prueba enviada", description: "Se disparó un stream alert de prueba.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo probar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <Alert title="Cargando alertas" description="Consultando configuración actual de stream alerts." />;
  if (error) return <Alert title="No se pudo cargar alertas" description={error} variant="danger" />;

  return (
    <PaneGrid>
      <SectionCard title="Centro de alertas" description="Canales, directos y eventos del panel legacy.">
        <Tabs
          items={[
            { id: "channel", label: "Canal" },
            { id: "stream", label: "Directos" },
            { id: "events", label: "Eventos" },
            { id: "digest", label: "Resumen" },
          ]}
          value={tab}
          onValueChange={setTab}
          className="mb-5"
        />

        {tab === "stream" || tab === "channel" ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
              <div>
                <p className="font-medium text-white">Alertas habilitadas</p>
                <p className="text-sm text-zinc-400">Activa publicaciones automáticas en vivo.</p>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))} />
            </div>
            <Field label="Canal de publicación">
              <ChannelSelect value={form.channelId} onChange={(channelId) => setForm((current) => ({ ...current, channelId }))} options={channels} />
            </Field>
            {tab === "stream" ? (
              <>
                <Field label="Streamer o fuente">
                  <Input value={form.streamerName} onChange={(event) => setForm((current) => ({ ...current, streamerName: event.target.value }))} placeholder="Nombre del canal o creador" />
                </Field>
                <Field label="Mensaje">
                  <Textarea value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} />
                </Field>
              </>
            ) : null}
            <FormActions onSave={handleSave} onTest={handleTest} saving={saving} testing={testing} />
          </div>
        ) : (
          <Alert title={tab === "events" ? "Eventos" : "Resumen diario"} description="Estas pestañas del backup se conectarán en la siguiente iteración. Usa Directos para stream alerts." />
        )}
      </SectionCard>

      <SectionCard title="Preview del aviso" description="Tono y destino actual del disparador.">
        <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-50">
            <BellRing className="h-6 w-6" />
          </div>
          <p className="text-sm text-zinc-200">{form.message || "Configura un mensaje para ver el resultado aquí."}</p>
          <p className="mt-4 text-xs uppercase tracking-[0.2em] text-zinc-500">{form.streamerName || "Fuente sin definir"}</p>
        </div>
      </SectionCard>
    </PaneGrid>
  );
}
