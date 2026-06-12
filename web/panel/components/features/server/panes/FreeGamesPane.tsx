"use client";

import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import {
  getFreeGamesConfig,
  previewFreeGames,
  saveFreeGamesConfig,
  testFreeGames,
} from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { usePanel } from "@/components/providers/PanelProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Switch } from "@/components/ui/Switch";
import {
  ChannelSelect,
  Field,
  FormActions,
  LockedOverlay,
  PaneGrid,
  PremiumLock,
  SectionCard,
  Textarea,
} from "@/components/features/shared";
import { asRecord, getErrorMessage, toBooleanValue, toStringValue } from "@/lib/utils";

type FreeGamesState = {
  enabled: boolean;
  channelId: string;
  message: string;
};

export function FreeGamesPane({ guildId }: { guildId: string }) {
  const { hasPremium } = usePanel();
  const { channels } = useGuildChannels(guildId);
  const { toast } = useToast();
  const [form, setForm] = useState<FreeGamesState>({ enabled: false, channelId: "", message: "" });
  const [preview, setPreview] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getFreeGamesConfig(guildId), previewFreeGames(guildId).catch(() => ({}))])
      .then(([configData, previewData]) => {
        if (!active) return;
        const config = asRecord(configData);
        setForm({
          enabled: toBooleanValue(config.enabled),
          channelId: toStringValue(config.channelId),
          message: toStringValue(config.message || config.template),
        });
        setPreview(asRecord(previewData));
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

  async function handleSave() {
    setSaving(true);
    try {
      await saveFreeGamesConfig(guildId, form);
      toast({ title: "Juegos gratis guardados", description: "La automatización fue actualizada.", tone: "success" });
      const [configData, previewData] = await Promise.all([
        getFreeGamesConfig(guildId),
        previewFreeGames(guildId).catch(() => ({})),
      ]);
      const config = asRecord(configData);
      setForm({
        enabled: toBooleanValue(config.enabled),
        channelId: toStringValue(config.channelId),
        message: toStringValue(config.message || config.template),
      });
      setPreview(asRecord(previewData));
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      await testFreeGames(guildId);
      toast({ title: "Prueba enviada", description: "Se publicó una muestra de free games.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo probar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <Alert title="Cargando juegos gratis" description="Sincronizando config y preview actual." />;
  if (error) return <Alert title="No se pudo cargar free games" description={error} variant="danger" />;

  return (
    <div className="relative">
      <LockedOverlay visible={!hasPremium} title="Free games premium" description="El feed de ofertas gratuitas está reservado para comunidades con EyedPlus+." />
      <PaneGrid>
        <SectionCard title="Feed de juegos gratis" description="Publica ofertas automáticas con estilo visual consistente." action={<PremiumLock locked={!hasPremium} />}>
          <div className={!hasPremium ? "pointer-events-none opacity-50" : ""}>
            <div className="space-y-5">
              <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                <div>
                  <p className="font-medium text-white">Feed habilitado</p>
                  <p className="text-sm text-zinc-400">Envía ofertas automáticas al canal elegido.</p>
                </div>
                <Switch checked={form.enabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))} />
              </div>
              <Field label="Canal de anuncios">
                <ChannelSelect value={form.channelId} onChange={(channelId) => setForm((current) => ({ ...current, channelId }))} options={channels} />
              </Field>
              <Field label="Plantilla del mensaje">
                <Textarea value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} />
              </Field>
              <FormActions onSave={handleSave} onTest={handleTest} saving={saving} testing={testing} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Preview" description="Representación resumida del contenido más reciente.">
          <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-500/15 text-fuchsia-50">
              <Gift className="h-6 w-6" />
            </div>
            <p className="font-medium text-white">{toStringValue(preview.title, "Sin oferta precargada")}</p>
            <p className="mt-2 text-sm text-zinc-300">{toStringValue(preview.description, form.message || "El preview aparecerá cuando el backend devuelva datos.")}</p>
          </div>
        </SectionCard>
      </PaneGrid>
    </div>
  );
}
