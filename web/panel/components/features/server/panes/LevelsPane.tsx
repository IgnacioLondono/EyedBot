"use client";

import { useEffect, useState } from "react";
import { Award, Trophy } from "lucide-react";
import { getLevelingConfig, getLevelingLeaderboard, saveLevelingConfig } from "@/lib/api/endpoints";
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
import { asArray, asRecord, getErrorMessage, toBooleanValue, toNumberValue, toStringValue } from "@/lib/utils";

type LevelsState = {
  enabled: boolean;
  announceChannelId: string;
  xpPerMessage: number;
  cooldownSeconds: number;
};

export function LevelsPane({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { toast } = useToast();
  const [form, setForm] = useState<LevelsState>({
    enabled: false,
    announceChannelId: "",
    xpPerMessage: 10,
    cooldownSeconds: 60,
  });
  const [leaderboard, setLeaderboard] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getLevelingConfig(guildId), getLevelingLeaderboard(guildId)])
      .then(([configData, boardData]) => {
        if (!active) return;
        const config = asRecord(configData);
        setForm({
          enabled: toBooleanValue(config.enabled),
          announceChannelId: toStringValue(config.announceChannelId || config.channelId),
          xpPerMessage: toNumberValue(config.xpPerMessage || config.xp_gain, 10),
          cooldownSeconds: toNumberValue(config.cooldownSeconds || config.cooldown, 60),
        });
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

  async function handleSave() {
    setSaving(true);
    try {
      await saveLevelingConfig(guildId, form);
      toast({ title: "Niveles guardados", description: "La configuración de progresión fue actualizada.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Alert title="Cargando niveles" description="Recuperando configuración y leaderboard." />;
  if (error) return <Alert title="No se pudo cargar niveles" description={error} variant="danger" />;

  return (
    <PaneGrid>
      <SectionCard title="Progresión del servidor" description="Ajusta el ritmo de XP y anuncios automáticos.">
        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
            <div>
              <p className="font-medium text-white">Sistema habilitado</p>
              <p className="text-sm text-zinc-400">Permite acumular experiencia y subir de nivel.</p>
            </div>
            <Switch checked={form.enabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))} />
          </div>

          <Field label="Canal de anuncio">
            <ChannelSelect
              value={form.announceChannelId}
              onChange={(announceChannelId) => setForm((current) => ({ ...current, announceChannelId }))}
              options={channels}
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="XP por mensaje">
              <Input
                type="number"
                value={form.xpPerMessage}
                onChange={(event) => setForm((current) => ({ ...current, xpPerMessage: Number(event.target.value) }))}
              />
            </Field>

            <Field label="Cooldown (segundos)">
              <Input
                type="number"
                value={form.cooldownSeconds}
                onChange={(event) => setForm((current) => ({ ...current, cooldownSeconds: Number(event.target.value) }))}
              />
            </Field>
          </div>

          <FormActions onSave={handleSave} saving={saving} />
        </div>
      </SectionCard>

      <SectionCard title="Leaderboard" description="Rendimiento reciente de los miembros más activos.">
        {leaderboard.length ? (
          <div className="space-y-3">
            {leaderboard.slice(0, 8).map((entry, index) => (
              <div key={`${entry.userId ?? entry.id ?? index}`} className="flex items-center gap-4 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-100">
                  {index === 0 ? <Trophy className="h-5 w-5" /> : <Award className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{toStringValue(entry.username || entry.userTag || entry.userId, "Usuario")}</p>
                  <p className="text-sm text-zinc-400">
                    Nivel {toStringValue(entry.level, "0")} · XP {toStringValue(entry.xp || entry.totalXp, "0")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Alert title="Sin ranking todavía" description="Aún no hay datos suficientes para mostrar posiciones." />
        )}
      </SectionCard>
    </PaneGrid>
  );
}
