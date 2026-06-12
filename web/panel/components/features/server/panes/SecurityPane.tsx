"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import {
  applyChannelSetup,
  getAntiRaidConfig,
  getChannelSetup,
  saveAntiRaidConfig,
} from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { usePanel } from "@/components/providers/PanelProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Tabs } from "@/components/ui/Tabs";
import { Switch } from "@/components/ui/Switch";
import { Button } from "@/components/ui/Button";
import {
  ChannelSelect,
  Field,
  FormActions,
  Input,
  LockedOverlay,
  PaneGrid,
  PremiumLock,
  SectionCard,
  Textarea,
} from "@/components/features/shared";
import { asRecord, getErrorMessage, toBooleanValue, toNumberValue, toStringValue } from "@/lib/utils";

const SECURITY_TABS = [
  { id: "raid", label: "Anti-raid" },
  { id: "setup", label: "Canales" },
  { id: "antispam", label: "Anti-spam" },
  { id: "content", label: "Contenido" },
];

type SetupState = { categoryName: string; channels: string };
type AntiRaidState = {
  enabled: boolean;
  alertChannelId: string;
  joinThreshold: number;
  timeWindowSeconds: number;
};

export function SecurityPane({ guildId }: { guildId: string }) {
  const { hasPremium } = usePanel();
  const { channels } = useGuildChannels(guildId);
  const { toast } = useToast();
  const [tab, setTab] = useState("raid");
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

  if (loading) return <Alert title="Cargando seguridad" description="Consultando anti-raid y setup de canales." />;
  if (error) return <Alert title="No se pudo cargar seguridad" description={error} variant="danger" />;

  return (
    <div className="relative">
      <LockedOverlay
        visible={!hasPremium}
        title="Seguridad avanzada premium"
        description="Anti-raid, setup de canales y filtros avanzados requieren EyedPlus+."
      />

      <SectionCard
        title="Centro de seguridad"
        description="Protección de entrada, canales y moderación preventiva."
        action={<PremiumLock locked={!hasPremium} />}
      >
        <Tabs items={SECURITY_TABS} value={tab} onValueChange={setTab} className="mb-6" />

        <div className={!hasPremium ? "pointer-events-none opacity-50" : ""}>
          {tab === "raid" ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                <div>
                  <p className="font-medium text-white">Protección anti-raid</p>
                  <p className="text-sm text-zinc-400">Alerta cuando entren demasiados usuarios en poco tiempo.</p>
                </div>
                <Switch checked={antiRaid.enabled} onCheckedChange={(checked) => setAntiRaid((c) => ({ ...c, enabled: checked }))} />
              </div>
              <Field label="Canal de alerta">
                <ChannelSelect
                  value={antiRaid.alertChannelId}
                  onChange={(alertChannelId) => setAntiRaid((c) => ({ ...c, alertChannelId }))}
                  options={channels}
                />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Usuarios dentro del umbral">
                  <Input
                    type="number"
                    value={antiRaid.joinThreshold}
                    onChange={(event) => setAntiRaid((c) => ({ ...c, joinThreshold: Number(event.target.value) }))}
                  />
                </Field>
                <Field label="Ventana en segundos">
                  <Input
                    type="number"
                    value={antiRaid.timeWindowSeconds}
                    onChange={(event) => setAntiRaid((c) => ({ ...c, timeWindowSeconds: Number(event.target.value) }))}
                  />
                </Field>
              </div>
              <FormActions onSave={saveAntiRaid} saving={saving} />
            </div>
          ) : null}

          {tab === "setup" ? (
            <PaneGrid>
              <div className="space-y-5">
                <Field label="Nombre de la categoría principal">
                  <Input value={setup.categoryName} onChange={(event) => setSetup((c) => ({ ...c, categoryName: event.target.value }))} />
                </Field>
                <Field label="Canales a crear" description="Un canal por línea.">
                  <Textarea value={setup.channels} onChange={(event) => setSetup((c) => ({ ...c, channels: event.target.value }))} />
                </Field>
                <Button onClick={() => void applySetup()} disabled={applying}>
                  {applying ? "Aplicando..." : "Crear estructura"}
                </Button>
              </div>
              <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-100">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <p className="text-sm text-zinc-300">
                  Crea una base de canales para moderación, reglas y soporte sin salir del panel.
                </p>
              </div>
            </PaneGrid>
          ) : null}

          {tab === "antispam" || tab === "content" ? (
            <Alert
              title={tab === "antispam" ? "Anti-spam" : "Filtro de contenido"}
              description="Estas pestañas existían en el panel legacy y se migrarán en la siguiente iteración. Por ahora usa Anti-raid y Moderación."
            />
          ) : null}
        </div>
      </SectionCard>

      <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
        <div className="mb-2 flex items-center gap-2 font-medium">
          <ShieldAlert className="h-4 w-4" />
          Entrada y confianza
        </div>
        Combina este módulo con Verificación y Moderación para cubrir el flujo completo del backup.
      </div>
    </div>
  );
}
