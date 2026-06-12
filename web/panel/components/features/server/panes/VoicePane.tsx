"use client";

import { useEffect, useState } from "react";
import { Mic2 } from "lucide-react";
import { getTempVoiceConfig, saveTempVoiceConfig } from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Switch } from "@/components/ui/Switch";
import {
  ChannelSelect,
  Field,
  FormActions,
  Input,
  PaneGrid,
  SectionCard,
} from "@/components/features/shared";
import { asRecord, getErrorMessage, toBooleanValue, toNumberValue, toStringValue } from "@/lib/utils";

type VoiceState = {
  enabled: boolean;
  lobbyChannelId: string;
  categoryId: string;
  userLimit: number;
};

export function VoicePane({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { toast } = useToast();
  const [form, setForm] = useState<VoiceState>({
    enabled: false,
    lobbyChannelId: "",
    categoryId: "",
    userLimit: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getTempVoiceConfig(guildId)
      .then((payload) => {
        const data = asRecord(payload);
        setForm({
          enabled: toBooleanValue(data.enabled),
          lobbyChannelId: toStringValue(data.lobbyChannelId || data.channelId),
          categoryId: toStringValue(data.categoryId),
          userLimit: toNumberValue(data.userLimit, 0),
        });
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [guildId]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveTempVoiceConfig(guildId, form);
      toast({ title: "Voz temporal guardada", description: "La automatización de canales quedó actualizada.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Alert title="Cargando voz temporal" description="Sincronizando configuración del módulo." />;
  if (error) return <Alert title="No se pudo cargar voz temporal" description={error} variant="danger" />;

  return (
    <PaneGrid>
      <SectionCard title="Canales de voz temporales" description="Crea salas efímeras a partir de un lobby principal.">
        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
            <div>
              <p className="font-medium text-white">Activar módulo</p>
              <p className="text-sm text-zinc-400">Cada usuario que entre al lobby recibirá una sala dedicada.</p>
            </div>
            <Switch checked={form.enabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))} />
          </div>

          <Field label="Canal lobby">
            <ChannelSelect value={form.lobbyChannelId} onChange={(lobbyChannelId) => setForm((current) => ({ ...current, lobbyChannelId }))} options={channels} />
          </Field>

          <Field label="ID de categoría destino">
            <Input value={form.categoryId} onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))} placeholder="Categoría donde se crearán los canales" />
          </Field>

          <Field label="Límite por canal">
            <Input type="number" value={form.userLimit} onChange={(event) => setForm((current) => ({ ...current, userLimit: Number(event.target.value) }))} />
          </Field>

          <FormActions onSave={handleSave} saving={saving} />
        </div>
      </SectionCard>

      <SectionCard title="Escenario actual" description="Resumen del comportamiento de entrada configurado.">
        <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-500/15 text-fuchsia-100">
            <Mic2 className="h-6 w-6" />
          </div>
          <p className="text-sm text-zinc-300">
            {form.enabled
              ? `Los usuarios que entren a ${channels.find((channel) => channel.id === form.lobbyChannelId)?.name || "tu lobby"} generarán una sala temporal.`
              : "El módulo está desactivado y no creará salas nuevas."}
          </p>
        </div>
      </SectionCard>
    </PaneGrid>
  );
}
