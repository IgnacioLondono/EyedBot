"use client";

import { useEffect, useMemo, useState } from "react";
import { Award, Plus, Trash2, Trophy } from "lucide-react";
import { getLevelingConfig, getLevelingLeaderboard, saveLevelingConfig } from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { useGuildRoles } from "@/lib/hooks/useGuildRoles";
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
  PaneGrid,
  RoleSelect,
  SectionCard,
} from "@/components/features/shared";
import {
  LEVEL_CURVE_PRESETS,
  buildLevelMilestones,
  sanitizeDifficulty,
  sanitizeXpMultiplier,
  xpForLevel,
} from "@/lib/leveling-math";
import { asArray, asRecord, getErrorMessage, toBooleanValue, toNumberValue, toStringValue } from "@/lib/utils";

type LevelReward = { level: number; roleId: string };

type LevelingState = {
  enabled: boolean;
  messageXpEnabled: boolean;
  voiceXpEnabled: boolean;
  messageCooldownMs: number;
  messageXpMin: number;
  messageXpMax: number;
  voiceXpPerMinute: number;
  voiceRequirePeers: boolean;
  xpMultiplier: number;
  difficulty: { baseXp: number; exponent: number };
  roleRewards: LevelReward[];
  levelUpAnnounceChannelId: string;
};

const LEVEL_TABS = [
  { id: "config", label: "Configuración" },
  { id: "curve", label: "Curva XP" },
  { id: "rewards", label: "Recompensas" },
  { id: "leaderboard", label: "Leaderboard" },
];

function normalizeConfig(value: unknown): LevelingState {
  const data = asRecord(value);
  const difficulty = sanitizeDifficulty(asRecord(data.difficulty));
  const rewards = asArray(data.roleRewards).map((entry) => {
    const row = asRecord(entry);
    return {
      level: Math.max(1, toNumberValue(row.level, 1)),
      roleId: toStringValue(row.roleId),
    };
  });

  return {
    enabled: toBooleanValue(data.enabled),
    messageXpEnabled: data.messageXpEnabled !== false,
    voiceXpEnabled: data.voiceXpEnabled !== false,
    messageCooldownMs: toNumberValue(data.messageCooldownMs, 45000),
    messageXpMin: toNumberValue(data.messageXpMin, 10),
    messageXpMax: toNumberValue(data.messageXpMax, 16),
    voiceXpPerMinute: toNumberValue(data.voiceXpPerMinute, 6),
    voiceRequirePeers: data.voiceRequirePeers !== false,
    xpMultiplier: sanitizeXpMultiplier(data.xpMultiplier),
    difficulty,
    roleRewards: rewards.filter((row) => row.roleId),
    levelUpAnnounceChannelId: toStringValue(data.levelUpAnnounceChannelId || data.announceChannelId),
  };
}

export function LevelsPane({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { roles } = useGuildRoles(guildId);
  const { toast } = useToast();
  const [tab, setTab] = useState("config");
  const [form, setForm] = useState<LevelingState>(() => normalizeConfig({}));
  const [leaderboard, setLeaderboard] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getLevelingConfig(guildId), getLevelingLeaderboard(guildId)])
      .then(([configData, boardData]) => {
        if (!active) return;
        setForm(normalizeConfig(configData));
        setLeaderboard(asArray(boardData).map((entry) => asRecord(entry)));
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

  const milestones = useMemo(() => buildLevelMilestones(form.difficulty), [form.difficulty]);
  const curvePreview = useMemo(
    () => Array.from({ length: 12 }, (_, index) => xpForLevel(index + 1, form.difficulty)),
    [form.difficulty]
  );

  async function handleSave() {
    if (form.messageXpMax < form.messageXpMin) {
      toast({ title: "XP inválido", description: "El máximo por mensaje no puede ser menor que el mínimo.", tone: "danger" });
      return;
    }

    setSaving(true);
    try {
      await saveLevelingConfig(guildId, form);
      toast({ title: "Niveles guardados", description: "Configuración, curva y recompensas actualizadas.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  function addReward() {
    const nextLevel =
      form.roleRewards.reduce((max, row) => Math.max(max, row.level), 0) + 5 || 5;
    setForm((current) => ({
      ...current,
      roleRewards: [...current.roleRewards, { level: nextLevel, roleId: "" }],
    }));
  }

  function updateReward(index: number, patch: Partial<LevelReward>) {
    setForm((current) => ({
      ...current,
      roleRewards: current.roleRewards.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row
      ),
    }));
  }

  function removeReward(index: number) {
    setForm((current) => ({
      ...current,
      roleRewards: current.roleRewards.filter((_, rowIndex) => rowIndex !== index),
    }));
  }

  if (loading) return <Alert title="Cargando niveles" description="Recuperando configuración, curva y ranking." />;
  if (error) return <Alert title="No se pudo cargar niveles" description={error} variant="danger" />;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Estado</p>
          <p className={`mt-2 text-lg font-semibold ${form.enabled ? "text-emerald-300" : "text-zinc-400"}`}>
            {form.enabled ? "Activo" : "Inactivo"}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">XP base</p>
          <p className="mt-2 text-lg font-semibold text-white">{form.difficulty.baseXp}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Exponente</p>
          <p className="mt-2 text-lg font-semibold text-white">{form.difficulty.exponent}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Recompensas</p>
          <p className="mt-2 text-lg font-semibold text-white">{form.roleRewards.length}</p>
        </div>
      </div>

      <Tabs items={LEVEL_TABS} value={tab} onValueChange={setTab} />

      {tab === "config" ? (
        <PaneGrid>
          <SectionCard title="Progresión general" description="Activa el sistema y define cómo se gana experiencia.">
            <div className="space-y-5">
              <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                <div>
                  <p className="font-medium text-white">Sistema habilitado</p>
                  <p className="text-sm text-zinc-400">Permite acumular XP por chat y voz.</p>
                </div>
                <Switch checked={form.enabled} onCheckedChange={(checked) => setForm((c) => ({ ...c, enabled: checked }))} />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                  <span className="text-sm text-zinc-300">XP por mensajes</span>
                  <Switch
                    checked={form.messageXpEnabled}
                    onCheckedChange={(checked) => setForm((c) => ({ ...c, messageXpEnabled: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                  <span className="text-sm text-zinc-300">XP por voz</span>
                  <Switch
                    checked={form.voiceXpEnabled}
                    onCheckedChange={(checked) => setForm((c) => ({ ...c, voiceXpEnabled: checked }))}
                  />
                </div>
              </div>

              <Field label="Canal de anuncio de subida">
                <ChannelSelect
                  value={form.levelUpAnnounceChannelId}
                  onChange={(levelUpAnnounceChannelId) => setForm((c) => ({ ...c, levelUpAnnounceChannelId }))}
                  options={channels}
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="XP mínimo por mensaje">
                  <Input
                    type="number"
                    value={form.messageXpMin}
                    onChange={(event) => setForm((c) => ({ ...c, messageXpMin: Number(event.target.value) }))}
                  />
                </Field>
                <Field label="XP máximo por mensaje">
                  <Input
                    type="number"
                    value={form.messageXpMax}
                    onChange={(event) => setForm((c) => ({ ...c, messageXpMax: Number(event.target.value) }))}
                  />
                </Field>
                <Field label="Cooldown mensajes (seg)">
                  <Input
                    type="number"
                    value={Math.round(form.messageCooldownMs / 1000)}
                    onChange={(event) =>
                      setForm((c) => ({ ...c, messageCooldownMs: Math.max(10, Number(event.target.value)) * 1000 }))
                    }
                  />
                </Field>
                <Field label="XP por minuto en voz">
                  <Input
                    type="number"
                    value={form.voiceXpPerMinute}
                    onChange={(event) => setForm((c) => ({ ...c, voiceXpPerMinute: Number(event.target.value) }))}
                  />
                </Field>
                <Field label="Multiplicador global">
                  <Input
                    type="number"
                    step="0.1"
                    value={form.xpMultiplier}
                    onChange={(event) =>
                      setForm((c) => ({ ...c, xpMultiplier: sanitizeXpMultiplier(event.target.value) }))
                    }
                  />
                </Field>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                <div>
                  <p className="font-medium text-white">Requerir compañía en voz</p>
                  <p className="text-sm text-zinc-400">Solo da XP si hay más de una persona en el canal.</p>
                </div>
                <Switch
                  checked={form.voiceRequirePeers}
                  onCheckedChange={(checked) => setForm((c) => ({ ...c, voiceRequirePeers: checked }))}
                />
              </div>

              <FormActions onSave={handleSave} saving={saving} />
            </div>
          </SectionCard>
        </PaneGrid>
      ) : null}

      {tab === "curve" ? (
        <PaneGrid>
          <SectionCard title="Curva de experiencia" description="Ajusta la dificultad y aplica presets del panel legacy.">
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="XP base por nivel">
                  <Input
                    type="number"
                    value={form.difficulty.baseXp}
                    onChange={(event) =>
                      setForm((c) => ({
                        ...c,
                        difficulty: sanitizeDifficulty({ ...c.difficulty, baseXp: Number(event.target.value) }),
                      }))
                    }
                  />
                </Field>
                <Field label="Exponente de curva">
                  <Input
                    type="number"
                    step="0.01"
                    value={form.difficulty.exponent}
                    onChange={(event) =>
                      setForm((c) => ({
                        ...c,
                        difficulty: sanitizeDifficulty({ ...c.difficulty, exponent: Number(event.target.value) }),
                      }))
                    }
                  />
                </Field>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {LEVEL_CURVE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      setForm((c) => ({
                        ...c,
                        difficulty: { baseXp: preset.baseXp, exponent: preset.exponent },
                      }))
                    }
                    className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-500/40"
                  >
                    <p className="font-medium text-white">{preset.name}</p>
                    <p className="mt-1 text-xs text-zinc-500">{preset.description}</p>
                    <p className="mt-3 text-sm text-violet-200">
                      Base {preset.baseXp} · Exp {preset.exponent}
                    </p>
                  </button>
                ))}
              </div>

              <FormActions onSave={handleSave} saving={saving} />
            </div>
          </SectionCard>

          <SectionCard title="Vista previa" description="XP requerida por nivel y hitos principales.">
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {curvePreview.map((value, index) => (
                  <div key={index} className="rounded-xl border border-white/8 bg-black/20 px-2 py-3 text-center">
                    <p className="text-[10px] text-zinc-500">Nv {index + 1}</p>
                    <p className="text-sm font-semibold text-white">{value.toLocaleString("es-ES")}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {milestones.map((item) => (
                  <div key={item.level} className="flex items-center justify-between rounded-xl border border-white/8 px-4 py-3">
                    <span className="text-sm text-zinc-300">Nivel {item.level}</span>
                    <span className="text-sm text-white">{item.totalXp.toLocaleString("es-ES")} XP total</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        </PaneGrid>
      ) : null}

      {tab === "rewards" ? (
        <SectionCard title="Roles por nivel" description="Otorga roles automáticamente al alcanzar ciertos niveles.">
          <div className="space-y-4">
            {form.roleRewards.length ? (
              form.roleRewards.map((reward, index) => (
                <div key={`${index}-${reward.level}`} className="grid gap-3 rounded-2xl border border-white/8 bg-black/20 p-4 md:grid-cols-[120px_1fr_auto]">
                  <Field label="Nivel">
                    <Input
                      type="number"
                      min={1}
                      value={reward.level}
                      onChange={(event) => updateReward(index, { level: Number(event.target.value) })}
                    />
                  </Field>
                  <Field label="Rol">
                    <RoleSelect
                      value={reward.roleId}
                      onChange={(roleId) => updateReward(index, { roleId })}
                      options={roles}
                    />
                  </Field>
                  <div className="flex items-end">
                    <Button variant="danger" size="sm" onClick={() => removeReward(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <Alert title="Sin recompensas" description="Añade roles que se entreguen al subir de nivel." />
            )}

            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={addReward}>
                <Plus className="h-4 w-4" />
                Añadir recompensa
              </Button>
              <FormActions onSave={handleSave} saving={saving} />
            </div>
          </div>
        </SectionCard>
      ) : null}

      {tab === "leaderboard" ? (
        <SectionCard title="Leaderboard" description="Top de miembros con más experiencia acumulada.">
          {leaderboard.length ? (
            <div className="space-y-3">
              {leaderboard.slice(0, 25).map((entry, index) => (
                <div
                  key={`${entry.userId ?? entry.id ?? index}`}
                  className="flex items-center gap-4 rounded-2xl border border-white/8 bg-black/20 px-4 py-3"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-100">
                    {index === 0 ? <Trophy className="h-5 w-5" /> : <Award className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">
                      {toStringValue(entry.username || entry.userTag || entry.tag || entry.userId, "Usuario")}
                    </p>
                    <p className="text-sm text-zinc-400">
                      Nivel {toStringValue(entry.level, "0")} · XP {toStringValue(entry.xp || entry.totalXp, "0")}
                      {entry.messageCount ? ` · ${toStringValue(entry.messageCount)} msgs` : ""}
                      {entry.voiceMinutes ? ` · ${toStringValue(entry.voiceMinutes)} min voz` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Alert title="Sin ranking todavía" description="Aún no hay datos suficientes para mostrar posiciones." />
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}
