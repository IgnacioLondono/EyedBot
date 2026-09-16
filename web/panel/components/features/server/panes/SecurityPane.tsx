"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { getAntiRaidConfig, saveAntiRaidConfig } from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { useGuildRoles } from "@/lib/hooks/useGuildRoles";
import { usePanel } from "@/components/providers/PanelProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { paneTabKey, usePersistedTab } from "@/lib/hooks/usePersistedTab";
import { Alert } from "@/components/ui/Alert";
import { Tabs } from "@/components/ui/Tabs";
import { Switch } from "@/components/ui/Switch";
import {
  ChannelSelect,
  Field,
  FormActions,
  Input,
  LockedOverlay,
  MultiRoleSelect,
  PremiumLock,
  RoleSelect,
  SectionCard,
  Select,
  Textarea,
} from "@/components/features/shared";
import { asRecord, getErrorMessage, toBooleanValue, toNumberValue, toStringValue } from "@/lib/utils";

const SECURITY_TABS = [
  { id: "raid", label: "Anti-raid" },
  { id: "bots", label: "Bots" },
  { id: "antispam", label: "Anti-spam" },
  { id: "content", label: "Contenido" },
  { id: "roles", label: "Roles y canales" },
];
const SECURITY_TAB_IDS = SECURITY_TABS.map((item) => item.id);

type BotFilterMode = "verified_only" | "allowlist_only" | "log_only";
type BotFilterAction = "kick" | "ban" | "log";

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
  botFilterEnabled: boolean;
  botFilterMode: BotFilterMode;
  botFilterAction: BotFilterAction;
  botAllowlistIds: string[];
  botRoleId: string;
  protectRoles: boolean;
  protectChannels: boolean;
  trustedRoleIds: string[];
  destructiveActionThreshold: number;
  actionWindowSec: number;
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
  botFilterEnabled: false,
  botFilterMode: "verified_only",
  botFilterAction: "kick",
  botAllowlistIds: [],
  botRoleId: "",
  protectRoles: true,
  protectChannels: true,
  trustedRoleIds: [],
  destructiveActionThreshold: 3,
  actionWindowSec: 60,
};

function normalizeIdList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((id) => String(id || "").trim()).filter((id) => /^\d{10,25}$/.test(id));
  }
  return String(value || "")
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter((id) => /^\d{10,25}$/.test(id));
}

function normalizeAntiRaid(value: unknown): AntiRaidState {
  const data = asRecord(value);
  const actionModeRaw = toStringValue(data.actionMode, "timeout");
  const actionMode = (["timeout", "kick", "ban"] as const).includes(actionModeRaw as AntiRaidState["actionMode"])
    ? (actionModeRaw as AntiRaidState["actionMode"])
    : "timeout";
  const botModeRaw = toStringValue(data.botFilterMode, "verified_only");
  const botFilterMode = (["verified_only", "allowlist_only", "log_only"] as const).includes(
    botModeRaw as BotFilterMode
  )
    ? (botModeRaw as BotFilterMode)
    : "verified_only";
  const botActionRaw = toStringValue(data.botFilterAction, "kick");
  const botFilterAction = (["kick", "ban", "log"] as const).includes(botActionRaw as BotFilterAction)
    ? (botActionRaw as BotFilterAction)
    : "kick";

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
    botFilterEnabled: toBooleanValue(data.botFilterEnabled),
    botFilterMode,
    botFilterAction,
    botAllowlistIds: normalizeIdList(data.botAllowlistIds),
    botRoleId: toStringValue(data.botRoleId),
    protectRoles: toBooleanValue(data.protectRoles, true),
    protectChannels: toBooleanValue(data.protectChannels, true),
    trustedRoleIds: normalizeIdList(data.trustedRoleIds),
    destructiveActionThreshold: toNumberValue(
      data.destructiveActionThreshold,
      defaultAntiRaid.destructiveActionThreshold
    ),
    actionWindowSec: toNumberValue(data.actionWindowSec, defaultAntiRaid.actionWindowSec),
  };
}

export function SecurityPane({ guildId }: { guildId: string }) {
  const { premiumLocked } = usePanel();
  const { channels } = useGuildChannels(guildId);
  const { roles } = useGuildRoles(guildId);
  const { toast } = useToast();
  const [tab, setTab] = usePersistedTab(paneTabKey(guildId, "security"), "raid", SECURITY_TAB_IDS);
  const [antiRaid, setAntiRaid] = useState<AntiRaidState>(defaultAntiRaid);
  const [allowlistText, setAllowlistText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getAntiRaidConfig(guildId)
      .then((antiRaidData) => {
        if (!active) return;
        const next = normalizeAntiRaid(antiRaidData);
        setAntiRaid(next);
        setAllowlistText(next.botAllowlistIds.join("\n"));
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
      const botAllowlistIds = normalizeIdList(allowlistText);
      const payload = { ...antiRaid, botAllowlistIds };
      await saveAntiRaidConfig(guildId, payload);
      setAntiRaid(payload);
      setAllowlistText(botAllowlistIds.join("\n"));
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
              <Field
                label="Canal de alerta"
                description="Aquí el bot envía todos los avisos de seguridad: ingresos sospechosos, spam, bots bloqueados y cambios de roles/canales."
              >
                <ChannelSelect
                  value={antiRaid.alertChannelId}
                  onChange={(alertChannelId) => setAntiRaid((c) => ({ ...c, alertChannelId }))}
                  options={channels}
                />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Umbral de entradas (ventana)"
                  description="Máximo de miembros que pueden entrar en 1 minuto antes de considerar que hay una raid. Si se supera, entra en acción."
                >
                  <Input
                    type="number"
                    value={antiRaid.joinRateThreshold}
                    onChange={(event) =>
                      setAntiRaid((c) => ({ ...c, joinRateThreshold: Number(event.target.value) }))
                    }
                  />
                </Field>
                <Field
                  label="Umbral duro de raid"
                  description="Saltillo superior: si entran más miembros que este número en la ventana, se aplica la acción automática directa."
                >
                  <Input
                    type="number"
                    value={antiRaid.raidJoinHardThreshold}
                    onChange={(event) =>
                      setAntiRaid((c) => ({ ...c, raidJoinHardThreshold: Number(event.target.value) }))
                    }
                  />
                </Field>
                <Field
                  label="Edad mínima de cuenta (días)"
                  description="Las cuentas más nuevas que este número de días se consideran sospechosas y se les aplica la acción automática."
                >
                  <Input
                    type="number"
                    value={antiRaid.accountAgeDays}
                    onChange={(event) =>
                      setAntiRaid((c) => ({ ...c, accountAgeDays: Number(event.target.value) }))
                    }
                  />
                </Field>
                <Field
                  label="Acción automática"
                  description="Qué hace el bot con el usuario sospechoso: mute temporal (timeout), expulsión (kick) o baneo (ban)."
                >
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
                <Field
                  label="Duración timeout (min)"
                  description="Cuánto dura el silencio aplicado a cuentas o entradas sospechosas (solo si la acción es timeout)."
                >
                  <Input
                    type="number"
                    value={antiRaid.timeoutMinutes}
                    onChange={(event) =>
                      setAntiRaid((c) => ({ ...c, timeoutMinutes: Number(event.target.value) }))
                    }
                  />
                </Field>
                <Field
                  label="Cooldown de acción (seg)"
                  description="Tiempo mínimo entre acciones punitivas de un mismo usuario, para no castigar dos veces la misma cosa."
                >
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

          {tab === "bots" ? (
            <div className="space-y-5">
              <Alert
                title="Filtro de bots"
                description="Detecta si un bot está verificado por Discord (badge oficial). Los no verificados se pueden expulsar; los verificados o en allowlist entran."
              />
              <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                <div>
                  <p className="font-medium text-white">Activar filtro de bots</p>
                  <p className="text-sm text-zinc-400">Se aplica al instante cuando un bot entra al servidor.</p>
                </div>
                <Switch
                  checked={antiRaid.botFilterEnabled}
                  onCheckedChange={(checked) => setAntiRaid((c) => ({ ...c, botFilterEnabled: checked }))}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Política"
                  description="Cómo se decide si un bot puede quedarse: solo los verificados por Discord (más tu allowlist), solo los de tu lista de IDs, o simplemente registrar sin expulsar."
                >
                  <Select
                    value={antiRaid.botFilterMode}
                    onChange={(event) =>
                      setAntiRaid((c) => ({
                        ...c,
                        botFilterMode: event.target.value as BotFilterMode,
                      }))
                    }
                  >
                    <option value="verified_only">Solo verificados (+ allowlist)</option>
                    <option value="allowlist_only">Solo allowlist (IDs)</option>
                    <option value="log_only">Solo registrar (no expulsar)</option>
                  </Select>
                </Field>
                <Field
                  label="Acción si no pasa"
                  description="Qué se hace con el bot rechazado: expulsarlo, banearlo o solo registrar el evento en el canal de alerta."
                >
                  <Select
                    value={antiRaid.botFilterAction}
                    onChange={(event) =>
                      setAntiRaid((c) => ({
                        ...c,
                        botFilterAction: event.target.value as BotFilterAction,
                      }))
                    }
                  >
                    <option value="kick">Expulsar</option>
                    <option value="ban">Ban</option>
                    <option value="log">Solo log</option>
                  </Select>
                </Field>
              </div>
              <Field
                label="Allowlist de bots (IDs)"
                description="Un ID por línea. Estos bots entran aunque no estén verificados (útil para EyedBot auxiliares, Mudae, etc.)."
              >
                <Textarea
                  value={allowlistText}
                  onChange={(event) => setAllowlistText(event.target.value)}
                  placeholder={"1495268496823681095\n…"}
                  rows={5}
                />
              </Field>
              <Field
                label="Rol para bots permitidos"
                description="Opcional. Si eliges el rol «Bots», se lo asigna a los que pasan el filtro."
              >
                <RoleSelect
                  value={antiRaid.botRoleId}
                  onChange={(botRoleId) => setAntiRaid((c) => ({ ...c, botRoleId }))}
                  options={roles}
                  placeholder="Sin rol automático"
                />
              </Field>
              <Field
                label="Canal de alerta"
                description="Canal donde el bot avisa de bots permitidos y de bots bloqueados. Si no eliges uno, usa el del anti-raid."
              >
                <ChannelSelect
                  value={antiRaid.alertChannelId}
                  onChange={(alertChannelId) => setAntiRaid((c) => ({ ...c, alertChannelId }))}
                  options={channels}
                />
              </Field>
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
                <Field
                  label="Mensajes máximos"
                  description="Máximo de mensajes que un miembro puede enviar dentro de la ventana antes de ser tratado como spammer."
                >
                  <Input
                    type="number"
                    value={antiRaid.spamMessages}
                    onChange={(event) => setAntiRaid((c) => ({ ...c, spamMessages: Number(event.target.value) }))}
                  />
                </Field>
                <Field
                  label="Ventana (seg)"
                  description="Segundos que se toman como referencia para contar la ráfaga de mensajes."
                >
                  <Input
                    type="number"
                    value={antiRaid.spamWindowSec}
                    onChange={(event) => setAntiRaid((c) => ({ ...c, spamWindowSec: Number(event.target.value) }))}
                  />
                </Field>
                <Field
                  label="Duplicados permitidos"
                  description="Cuántas veces seguidas se permite enviar exactamente el mismo mensaje antes de borrarlo."
                >
                  <Input
                    type="number"
                    value={antiRaid.duplicateMessageThreshold}
                    onChange={(event) =>
                      setAntiRaid((c) => ({ ...c, duplicateMessageThreshold: Number(event.target.value) }))
                    }
                  />
                </Field>
                <Field
                  label="Ventana duplicados (seg)"
                  description="Período durante el cual se comparan los mensajes repetidos."
                >
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
                <Field
                  label="Menciones máximas"
                  description="Máximo de @usuario permitidos en un solo mensaje. Por encima de esto se borra y se aplica la acción."
                >
                  <Input
                    type="number"
                    value={antiRaid.maxMentions}
                    onChange={(event) => setAntiRaid((c) => ({ ...c, maxMentions: Number(event.target.value) }))}
                  />
                </Field>
                <Field
                  label="Menciones de rol máximas"
                  description="Máximo de @Rol (menciones de rol) permitidas por mensaje, común abuso en raids @everyone."
                >
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

          {tab === "roles" ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div>
                    <p className="font-medium text-white">Protección de roles</p>
                    <p className="text-sm text-zinc-400">
                      Si alguien sin permiso crea o borra un rol, el bot revierte el cambio al instante y envía una alerta.
                    </p>
                  </div>
                  <Switch
                    checked={antiRaid.protectRoles}
                    onCheckedChange={(checked) => setAntiRaid((c) => ({ ...c, protectRoles: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div>
                    <p className="font-medium text-white">Protección de canales</p>
                    <p className="text-sm text-zinc-400">
                      Misma protección aplicada a canales: creaciones o borrados no autorizados se revierten y avisan.
                    </p>
                  </div>
                  <Switch
                    checked={antiRaid.protectChannels}
                    onCheckedChange={(checked) => setAntiRaid((c) => ({ ...c, protectChannels: checked }))}
                  />
                </div>
              </div>

              <Field
                label="Roles que pueden crear roles"
                description="Estos roles quedan exentos: sus miembros pueden crear y borrar roles y canales sin alertas ni reversión. Útil para staff o para el rol que asigna EyedPlus+ tras un pago. Recuerda que esos roles también quedan exentos del resto de filtros anti-raid."
              >
                <MultiRoleSelect
                  value={antiRaid.trustedRoleIds}
                  onChange={(trustedRoleIds) => setAntiRaid((c) => ({ ...c, trustedRoleIds }))}
                  options={roles}
                  emptyLabel="No hay roles disponibles."
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Umbral de cambios"
                  description="Cuántos cambios protegidos (crear/borrar roles o canales) se permiten en la ventana antes de aplicar la acción automática."
                >
                  <Input
                    type="number"
                    value={antiRaid.destructiveActionThreshold}
                    onChange={(event) =>
                      setAntiRaid((c) => ({ ...c, destructiveActionThreshold: Number(event.target.value) }))
                    }
                  />
                </Field>
                <Field
                  label="Ventana (seg)"
                  description="Segundos que el bot mira hacia atrás para contar los cambios de roles y canales de un mismo usuario."
                >
                  <Input
                    type="number"
                    value={antiRaid.actionWindowSec}
                    onChange={(event) =>
                      setAntiRaid((c) => ({ ...c, actionWindowSec: Number(event.target.value) }))
                    }
                  />
                </Field>
              </div>

              <Field
                label="Canal de alerta"
                description="Canal donde el bot avisa «Cambios destructivos detectados» cuando revierte roles o canales. Si no eliges uno, usa el del anti-raid."
              >
                <ChannelSelect
                  value={antiRaid.alertChannelId}
                  onChange={(alertChannelId) => setAntiRaid((c) => ({ ...c, alertChannelId }))}
                  options={channels}
                />
              </Field>
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