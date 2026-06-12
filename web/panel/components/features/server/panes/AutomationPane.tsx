"use client";

import { useEffect, useState } from "react";
import {
  applyChannelSetup,
  getAntiRaidConfig,
  getChannelSetup,
  saveAntiRaidConfig,
} from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Switch } from "@/components/ui/Switch";
import { Button } from "@/components/ui/Button";
import {
  ChannelSelect,
  Field,
  FormActions,
  Input,
  PaneGrid,
  SectionCard,
  Textarea,
} from "@/components/features/shared";
import { asRecord, getErrorMessage, toBooleanValue, toNumberValue, toStringValue } from "@/lib/utils";

type SetupState = {
  categoryName: string;
  channels: string;
};

type AntiRaidState = {
  enabled: boolean;
  alertChannelId: string;
  joinThreshold: number;
  timeWindowSeconds: number;
};

export function AutomationPane({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { toast } = useToast();
  const [setup, setSetup] = useState<SetupState>({ categoryName: "", channels: "" });
  const [antiRaid, setAntiRaid] = useState<AntiRaidState>({
    enabled: false,
    alertChannelId: "",
    joinThreshold: 5,
    timeWindowSeconds: 30,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getChannelSetup(guildId), getAntiRaidConfig(guildId)])
      .then(([setupData, antiRaidData]) => {
        if (!active) return;
        const normalizedSetup = asRecord(setupData);
        const normalizedRaid = asRecord(antiRaidData);
        setSetup({
          categoryName: toStringValue(normalizedSetup.categoryName || normalizedSetup.name),
          channels: Array.isArray(normalizedSetup.channels)
            ? normalizedSetup.channels.map((item) => toStringValue(asRecord(item).name || item)).join("\n")
            : toStringValue(normalizedSetup.channels),
        });
        setAntiRaid({
          enabled: toBooleanValue(normalizedRaid.enabled),
          alertChannelId: toStringValue(normalizedRaid.alertChannelId || normalizedRaid.channelId),
          joinThreshold: toNumberValue(normalizedRaid.joinThreshold, 5),
          timeWindowSeconds: toNumberValue(normalizedRaid.timeWindowSeconds || normalizedRaid.window, 30),
        });
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

  async function saveAntiRaid() {
    setSaving(true);
    try {
      await saveAntiRaidConfig(guildId, antiRaid);
      toast({ title: "Anti-raid guardado", description: "La protección automática fue actualizada.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function applySetup() {
    setApplying(true);
    try {
      await applyChannelSetup(guildId, {
        categoryName: setup.categoryName,
        channels: setup.channels
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
      });
      toast({ title: "Setup enviado", description: "La creación de canales fue solicitada.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo aplicar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setApplying(false);
    }
  }

  if (loading) return <Alert title="Cargando automatizaciones" description="Consultando setup de canales y anti-raid." />;
  if (error) return <Alert title="No se pudo cargar automatización" description={error} variant="danger" />;

  return (
    <PaneGrid>
      <SectionCard title="Setup de canales" description="Prepara una estructura inicial desde el panel.">
        <div className="space-y-5">
          <Field label="Nombre de la categoría principal">
            <Input value={setup.categoryName} onChange={(event) => setSetup((current) => ({ ...current, categoryName: event.target.value }))} />
          </Field>
          <Field label="Canales a crear" description="Escribe un canal por línea.">
            <Textarea value={setup.channels} onChange={(event) => setSetup((current) => ({ ...current, channels: event.target.value }))} />
          </Field>
          <Button onClick={() => void applySetup()} disabled={applying}>
            {applying ? "Aplicando..." : "Crear estructura"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Anti-raid" description="Define un umbral de entradas para disparar alertas.">
        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
            <div>
              <p className="font-medium text-white">Protección habilitada</p>
              <p className="text-sm text-zinc-400">Observa ingresos simultáneos sospechosos.</p>
            </div>
            <Switch checked={antiRaid.enabled} onCheckedChange={(checked) => setAntiRaid((current) => ({ ...current, enabled: checked }))} />
          </div>

          <Field label="Canal de alerta">
            <ChannelSelect value={antiRaid.alertChannelId} onChange={(alertChannelId) => setAntiRaid((current) => ({ ...current, alertChannelId }))} options={channels} />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Usuarios dentro del umbral">
              <Input type="number" value={antiRaid.joinThreshold} onChange={(event) => setAntiRaid((current) => ({ ...current, joinThreshold: Number(event.target.value) }))} />
            </Field>
            <Field label="Ventana en segundos">
              <Input type="number" value={antiRaid.timeWindowSeconds} onChange={(event) => setAntiRaid((current) => ({ ...current, timeWindowSeconds: Number(event.target.value) }))} />
            </Field>
          </div>

          <FormActions onSave={saveAntiRaid} saving={saving} />
        </div>
      </SectionCard>
    </PaneGrid>
  );
}
