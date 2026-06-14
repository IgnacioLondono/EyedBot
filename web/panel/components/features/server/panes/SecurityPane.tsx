"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { getAntiRaidConfig, saveAntiRaidConfig } from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { usePanel } from "@/components/providers/PanelProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
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
  Select,
} from "@/components/features/shared";
import { asRecord, getErrorMessage, toBooleanValue, toNumberValue, toStringValue } from "@/lib/utils";

const SECURITY_TABS = [
  { id: "raid", label: "Anti-raid" },
  { id: "antispam", label: "Anti-spam" },
  { id: "content", label: "Contenido" },
];

type AntiRaidState = {
  enabled: boolean;
  antiSpamEnabled: boolean;
  spamMessages: number;
  spamWindowSec: number;
  duplicateMessageThreshold: number;
  duplicateWindowSec: number;
  blockInvites: boolean;
  blockLinks: boolean;
  maxMentions: number;
  maxRoleMentions: number;
  joinRateThreshold: number;
  raidJoinHardThreshold: number;
  accountAgeDays: number;
  actionMode: "timeout" | "kick" | "ban";
  timeoutMinutes: number;
  actionCooldownSec: number;
  alertChannelId: string;
};

const defaultAntiRaid: AntiRaidState = {
  enabled: true,
  antiSpamEnabled: true,
  spamMessages: 7,
  spamWindowSec: 8,
  duplicateMessageThreshold: 3,
  duplicateWindowSec: 20,
  blockInvites: true,
  blockLinks: false,
  maxMentions: 6,
  maxRoleMentions: 3,
  joinRateThreshold: 8,
  raidJoinHardThreshold: 15,
  accountAgeDays: 3,
  actionMode: "timeout",
  timeoutMinutes: 30,
  actionCooldownSec: 30,
  alertChannelId: "",
};

function normalizeAntiRaid(value: unknown): AntiRaidState {
  const data = asRecord(value);
  const actionModeRaw = toStringValue(data.actionMode, "timeout");
  const actionMode = (["timeout", "kick", "ban"] as const).includes(actionModeRaw as AntiRaidState["actionMode"])
    ? (actionModeRaw as AntiRaidState["actionMode"])
    : "timeout";

  return {
    enabled: toBooleanValue(data.enabled, true),
    antiSpamEnabled: toBooleanValue(data.antiSpamEnabled, true),
    spamMessages: toNumberValue(data.spamMessages, defaultAntiRaid.spamMessages),
    spamWindowSec: toNumberValue(data.spamWindowSec, defaultAntiRaid.spamWindowSec),
    duplicateMessageThreshold: toNumberValue(
      data.duplicateMessageThreshold,
      defaultAntiRaid.duplicateMessageThreshold
    ),
    duplicateWindowSec: toNumberValue(data.duplicateWindowSec, defaultAntiRaid.duplicateWindowSec),
    blockInvites: toBooleanValue(data.blockInvites, true),
    blockLinks: toBooleanValue(data.blockLinks),
    maxMentions: toNumberValue(data.maxMentions, defaultAntiRaid.maxMentions),
    maxRoleMentions: toNumberValue(data.maxRoleMentions, defaultAntiRaid.maxRoleMentions),
    joinRateThreshold: toNumberValue(
      data.joinRateThreshold ?? data.joinThreshold,
      defaultAntiRaid.joinRateThreshold
    ),
    raidJoinHardThreshold: toNumberValue(
      data.raidJoinHardThreshold ?? data.timeWindowSeconds ?? data.window,
      defaultAntiRaid.raidJoinHardThreshold
    ),
    accountAgeDays: toNumberValue(data.accountAgeDays, defaultAntiRaid.accountAgeDays),
    actionMode,
    timeoutMinutes: toNumberValue(data.timeoutMinutes, defaultAntiRaid.timeoutMinutes),
    actionCooldownSec: toNumberValue(data.actionCooldownSec, defaultAntiRaid.actionCooldownSec),
    alertChannelId: toStringValue(data.alertChannelId || data.channelId),
  };
}

export function SecurityPane({ guildId }: { guildId: string }) {
  const { premiumLocked } = usePanel();
  const { channels } = useGuildChannels(guildId);
  const { toast } = useToast();
  const [tab, setTab] = useState("raid");
  const [antiRaid, setAntiRaid] = useState<AntiRaidState>(defaultAntiRaid);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getAntiRaidConfig(guildId)
      .then((antiRaidData) => {
        if (!active) return;
        setAntiRaid(normalizeAntiRaid(antiRaidData));
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
      toast({ title: "Seguridad guardada", description: "La configuración anti-raid fue actualizada.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Alert title="Cargando seguridad" description="Consultando anti-raid y filtros." />;
  if (error) return <Alert title="No se pudo cargar seguridad" description={error} variant="danger" />;

  return (
    <div className="relative">
      <LockedOverlay
        visible={premiumLocked}
        title="Seguridad avanzada premium"
        description="Anti-raid, setup de canales y filtros avanzados requieren EyedPlus+."
      />

      <SectionCard
        title="Centro de seguridad"
        description="Protección de entrada, canales y moderación preventiva."
        action={<PremiumLock locked={premiumLocked} />}
      >
        <Tabs items={SECURITY_TABS} value={tab} onValueChange={setTab} className="mb-6" />

        <div className={premiumLocked ? "pointer-events-none opacity-50" : ""}>
          {tab === "raid" ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                <div>
                  <p className="font-medium text-white">Protección anti-raid</p>
                  <p className="text-sm text-zinc-400">Alerta y actúa cuando entren demasiados usuarios en poco tiempo.</p>
                </div>
                <Switch
                  checked={antiRaid.enabled}
                  onCheckedChange={(checked) => setAntiRaid((c) => ({ ...c, enabled: checked }))}
                />
              </div>
              <Field label="Canal de alerta">
                <ChannelSelect
                  value={antiRaid.alertChannelId}
                  onChange={(alertChannelId) => setAntiRaid((c) => ({ ...c, alertChannelId }))}
                  options={channels}
                />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Umbral de entradas (ventana)">
                  <Input
                    type="number"
                    value={antiRaid.joinRateThreshold}
                    onChange={(event) =>
                      setAntiRaid((c) => ({ ...c, joinRateThreshold: Number(event.target.value) }))
                    }
                  />
                </Field>
                <Field label="Umbral duro de raid">
                  <Input
                    type="number"
                    value={antiRaid.raidJoinHardThreshold}
                    onChange={(event) =>
                      setAntiRaid((c) => ({ ...c, raidJoinHardThreshold: Number(event.target.value) }))
                    }
                  />
                </Field>
                <Field label="Edad mínima de cuenta (días)">
                  <Input
                    type="number"
                    value={antiRaid.accountAgeDays}
                    onChange={(event) =>
                      setAntiRaid((c) => ({ ...c, accountAgeDays: Number(event.target.value) }))
                    }
                  />
                </Field>
                <Field label="Acción automática">
                  <Select
                    value={antiRaid.actionMode}
                    onChange={(event) =>
                      setAntiRaid((c) => ({
                        ...c,
                        actionMode: event.target.value as AntiRaidState["actionMode"],
                      }))
                    }
                  >
                    <option value="timeout">Timeout</option>
                    <option value="kick">Expulsar</option>
                    <option value="ban">Ban</option>
                  </Select>
                </Field>
                <Field label="Duración timeout (min)">
                  <Input
                    type="number"
                    value={antiRaid.timeoutMinutes}
                    onChange={(event) =>
                      setAntiRaid((c) => ({ ...c, timeoutMinutes: Number(event.target.value) }))
                    }
                  />
                </Field>
                <Field label="Cooldown de acción (seg)">
                  <Input
                    type="number"
                    value={antiRaid.actionCooldownSec}
                    onChange={(event) =>
                      setAntiRaid((c) => ({ ...c, actionCooldownSec: Number(event.target.value) }))
                    }
                  />
                </Field>
              </div>
              <FormActions onSave={saveAntiRaid} saving={saving} />
            </div>
          ) : null}

          {tab === "antispam" ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                <div>
                  <p className="font-medium text-white">Anti-spam</p>
                  <p className="text-sm text-zinc-400">Limita ráfagas de mensajes y duplicados.</p>
                </div>
                <Switch
                  checked={antiRaid.antiSpamEnabled}
                  onCheckedChange={(checked) => setAntiRaid((c) => ({ ...c, antiSpamEnabled: checked }))}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Mensajes máximos">
                  <Input
                    type="number"
                    value={antiRaid.spamMessages}
                    onChange={(event) => setAntiRaid((c) => ({ ...c, spamMessages: Number(event.target.value) }))}
                  />
                </Field>
                <Field label="Ventana (seg)">
                  <Input
                    type="number"
                    value={antiRaid.spamWindowSec}
                    onChange={(event) => setAntiRaid((c) => ({ ...c, spamWindowSec: Number(event.target.value) }))}
                  />
                </Field>
                <Field label="Duplicados permitidos">
                  <Input
                    type="number"
                    value={antiRaid.duplicateMessageThreshold}
                    onChange={(event) =>
                      setAntiRaid((c) => ({ ...c, duplicateMessageThreshold: Number(event.target.value) }))
                    }
                  />
                </Field>
                <Field label="Ventana duplicados (seg)">
                  <Input
                    type="number"
                    value={antiRaid.duplicateWindowSec}
                    onChange={(event) =>
                      setAntiRaid((c) => ({ ...c, duplicateWindowSec: Number(event.target.value) }))
                    }
                  />
                </Field>
              </div>
              <FormActions onSave={saveAntiRaid} saving={saving} />
            </div>
          ) : null}

          {tab === "content" ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                <div>
                  <p className="font-medium text-white">Bloquear invitaciones</p>
                  <p className="text-sm text-zinc-400">Evita enlaces de invitación a otros servidores.</p>
                </div>
                <Switch
                  checked={antiRaid.blockInvites}
                  onCheckedChange={(checked) => setAntiRaid((c) => ({ ...c, blockInvites: checked }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                <div>
                  <p className="font-medium text-white">Bloquear enlaces</p>
                  <p className="text-sm text-zinc-400">Restringe URLs externas en mensajes.</p>
                </div>
                <Switch
                  checked={antiRaid.blockLinks}
                  onCheckedChange={(checked) => setAntiRaid((c) => ({ ...c, blockLinks: checked }))}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Menciones máximas">
                  <Input
                    type="number"
                    value={antiRaid.maxMentions}
                    onChange={(event) => setAntiRaid((c) => ({ ...c, maxMentions: Number(event.target.value) }))}
                  />
                </Field>
                <Field label="Menciones de rol máximas">
                  <Input
                    type="number"
                    value={antiRaid.maxRoleMentions}
                    onChange={(event) =>
                      setAntiRaid((c) => ({ ...c, maxRoleMentions: Number(event.target.value) }))
                    }
                  />
                </Field>
              </div>
              <FormActions onSave={saveAntiRaid} saving={saving} />
            </div>
          ) : null}
        </div>
      </SectionCard>

      <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
        <div className="mb-2 flex items-center gap-2 font-medium">
          <ShieldAlert className="h-4 w-4" />
          Entrada y confianza
        </div>
        Combina este módulo con Automatización, Verificación y Moderación para cubrir el flujo completo.
      </div>
    </div>
  );
}
