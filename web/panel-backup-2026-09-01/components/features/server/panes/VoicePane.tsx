"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock, Mic2, Pencil, Users } from "lucide-react";
import { getTempVoiceConfig, saveTempVoiceConfig } from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
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
  PaneGrid,
  SectionCard,
  Textarea,
} from "@/components/features/shared";
import { DiscordEmbedShell } from "@/components/features/embed/EmbedPreview";
import { asRecord, getErrorMessage, toBooleanValue, toNumberValue, toStringValue } from "@/lib/utils";

type VoiceState = {
  enabled: boolean;
  creatorChannelId: string;
  categoryId: string;
  channelNameTemplate: string;
  allowCustomNames: boolean;
  sendManageEmbed: boolean;
  userLimit: number;
};

const VOICE_TABS = [
  { id: "config", label: "Configuración" },
  { id: "panel", label: "Panel de control" },
  { id: "preview", label: "Vista previa" },
];
const VOICE_TAB_IDS = VOICE_TABS.map((item) => item.id);

function normalizeVoiceConfig(value: unknown): VoiceState {
  const data = asRecord(value);
  return {
    enabled: toBooleanValue(data.enabled),
    creatorChannelId: toStringValue(
      data.creatorChannelId || data.lobbyChannelId || data.hubChannelId || data.channelId
    ),
    categoryId: toStringValue(data.categoryId),
    channelNameTemplate: toStringValue(data.channelNameTemplate, "Canal de {username}"),
    allowCustomNames: data.allowCustomNames !== false,
    sendManageEmbed: toBooleanValue(data.sendManageEmbed),
    userLimit: toNumberValue(data.userLimit, 0),
  };
}

function VoicePanelPreview({ form }: { form: VoiceState }) {
  const limitLabel = form.userLimit > 0 ? `${form.userLimit} usuarios` : "Sin límite";

  return (
    <DiscordEmbedShell color="#8b5cf6">
      <div className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#949ba4]">EyedBot</p>
        <p className="mt-1 text-base font-semibold text-white">Panel de Voz</p>
        <p className="mt-2 text-sm text-[#dcddde]">
          Haz clic en los botones de abajo para controlar tu canal de voz.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-[#1e1f22] px-3 py-2 text-xs text-[#dcddde]">
            <span className="text-[#949ba4]">Estado</span>
            <p className="mt-1">🔓 Abierto</p>
          </div>
          <div className="rounded-lg bg-[#1e1f22] px-3 py-2 text-xs text-[#dcddde]">
            <span className="text-[#949ba4]">Límite</span>
            <p className="mt-1">{limitLabel}</p>
          </div>
          <div className="rounded-lg bg-[#1e1f22] px-3 py-2 text-xs text-[#dcddde]">
            <span className="text-[#949ba4]">Nombre</span>
            <p className="mt-1 truncate">{form.channelNameTemplate.replace("{username}", "usuario")}</p>
          </div>
        </div>
        {form.sendManageEmbed ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {["🔒", "🖋️", "👤", "👀"].map((emoji) => (
              <span
                key={emoji}
                className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-[#4e5058] px-3 text-sm"
              >
                {emoji}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-xs text-[#949ba4]">Panel de botones desactivado en la configuración.</p>
        )}
      </div>
    </DiscordEmbedShell>
  );
}

export function VoicePane({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { toast } = useToast();
  const [tab, setTab] = usePersistedTab(paneTabKey(guildId, "voice"), "config", VOICE_TAB_IDS);
  const [form, setForm] = useState<VoiceState>({
    enabled: false,
    creatorChannelId: "",
    categoryId: "",
    channelNameTemplate: "Canal de {username}",
    allowCustomNames: true,
    sendManageEmbed: false,
    userLimit: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const creatorName = useMemo(
    () => channels.find((channel) => channel.id === form.creatorChannelId)?.name,
    [channels, form.creatorChannelId]
  );

  const categoryName = useMemo(
    () => channels.find((channel) => channel.id === form.categoryId)?.name,
    [channels, form.categoryId]
  );

  useEffect(() => {
    void getTempVoiceConfig(guildId)
      .then((payload) => setForm(normalizeVoiceConfig(payload)))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [guildId]);

  async function handleSave() {
    if (form.enabled && !form.creatorChannelId) {
      toast({
        title: "Falta canal creador",
        description: "Selecciona el canal de voz donde los usuarios entrarán para crear su sala.",
        tone: "danger",
      });
      return;
    }

    setSaving(true);
    try {
      await saveTempVoiceConfig(guildId, form);
      toast({
        title: "Voz temporal guardada",
        description: "La automatización de canales quedó actualizada.",
        tone: "success",
      });
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
      <SectionCard
        title="Canales de voz temporales"
        description="Los usuarios entran a un canal creador y el bot genera una sala privada con panel de gestión."
      >
        <Tabs items={VOICE_TABS} value={tab} onValueChange={setTab} className="mb-5" />

        {tab === "config" ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
              <div>
                <p className="font-medium text-white">Activar módulo</p>
                <p className="text-sm text-zinc-400">
                  Al unirse al canal creador, cada usuario obtiene su propia sala de voz.
                </p>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))}
              />
            </div>

            <Field
              label="Canal creador (lobby)"
              description="Canal de voz al que deben entrar los usuarios para generar su sala temporal."
            >
              <ChannelSelect
                value={form.creatorChannelId}
                onChange={(creatorChannelId) => setForm((current) => ({ ...current, creatorChannelId }))}
                options={channels}
                filter="voice"
                placeholder="Selecciona canal de voz"
              />
            </Field>

            <Field
              label="Categoría destino"
              description="Opcional. Si no eliges una, se usa la categoría del canal creador."
            >
              <ChannelSelect
                value={form.categoryId}
                onChange={(categoryId) => setForm((current) => ({ ...current, categoryId }))}
                options={channels}
                filter="category"
                placeholder="Sin categoría específica"
              />
            </Field>

            <Field
              label="Plantilla de nombre"
              description="Variables: {username}, {displayName}, {user}. Si el usuario define nombre personalizado, tiene prioridad."
            >
              <Input
                value={form.channelNameTemplate}
                onChange={(event) => setForm((current) => ({ ...current, channelNameTemplate: event.target.value }))}
                placeholder="Canal de {username}"
              />
            </Field>

            <Field label="Límite de usuarios por canal" description="0 = sin límite. Máximo 99.">
              <Input
                type="number"
                min={0}
                max={99}
                value={form.userLimit}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    userLimit: Math.max(0, Math.min(99, Number(event.target.value) || 0)),
                  }))
                }
              />
            </Field>

            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
              <div>
                <p className="font-medium text-white">Nombres personalizados</p>
                <p className="text-sm text-zinc-400">Permite que el usuario elija el nombre de su canal al crearlo.</p>
              </div>
              <Switch
                checked={form.allowCustomNames}
                onCheckedChange={(allowCustomNames) => setForm((current) => ({ ...current, allowCustomNames }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
              <div>
                <p className="font-medium text-white">Panel de gestión en el canal</p>
                <p className="text-sm text-zinc-400">
                  Envía un embed con botones para bloquear, renombrar, ajustar límite y ver info.
                </p>
              </div>
              <Switch
                checked={form.sendManageEmbed}
                onCheckedChange={(sendManageEmbed) => setForm((current) => ({ ...current, sendManageEmbed }))}
              />
            </div>

            <FormActions onSave={handleSave} saving={saving} />
          </div>
        ) : null}

        {tab === "panel" ? (
          <div className="space-y-4">
            <Alert
              title="Controles del panel de voz"
              description="Cuando el panel de gestión está activo, el dueño del canal temporal ve estos botones en un mensaje fijado."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { icon: Lock, title: "Bloquear / Desbloquear", desc: "Controla quién puede entrar al canal." },
                { icon: Pencil, title: "Renombrar", desc: "Cambia el nombre de la sala temporal." },
                { icon: Users, title: "Ajustar límite", desc: "Define cuántos usuarios pueden conectarse." },
                { icon: Mic2, title: "Ver información", desc: "Muestra estado, conectados y datos del canal." },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                    <div className="mb-2 flex items-center gap-2 text-white">
                      <Icon className="h-4 w-4 text-violet-300" />
                      <span className="font-medium">{item.title}</span>
                    </div>
                    <p className="text-sm text-zinc-400">{item.desc}</p>
                  </div>
                );
              })}
            </div>
            <Field label="Comandos útiles cuando el canal está bloqueado">
              <Textarea
                readOnly
                value={"/vozinvitar — permite acceso a un usuario\n/vozquitar — revoca acceso a un usuario"}
                rows={3}
                className="font-mono text-sm text-zinc-400"
              />
            </Field>
            <FormActions onSave={handleSave} saving={saving} saveLabel="Guardar configuración" />
          </div>
        ) : null}

        {tab === "preview" ? (
          <div className="space-y-4">
            <VoicePanelPreview form={form} />
            <p className="text-sm text-zinc-500">
              Vista aproximada del embed que verán los usuarios en su canal temporal.
            </p>
            <FormActions onSave={handleSave} saving={saving} saveLabel="Guardar configuración" />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Resumen" description="Estado actual del módulo en este servidor.">
        <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-500/15 text-fuchsia-100">
            <Mic2 className="h-6 w-6" />
          </div>
          <ul className="space-y-2 text-sm text-zinc-300">
            <li>
              <span className="text-zinc-500">Estado:</span> {form.enabled ? "Activo" : "Desactivado"}
            </li>
            <li>
              <span className="text-zinc-500">Canal creador:</span> {creatorName ? `🔊 ${creatorName}` : "Sin configurar"}
            </li>
            <li>
              <span className="text-zinc-500">Categoría:</span> {categoryName ? `📁 ${categoryName}` : "Automática (del lobby)"}
            </li>
            <li>
              <span className="text-zinc-500">Plantilla:</span> {form.channelNameTemplate}
            </li>
            <li>
              <span className="text-zinc-500">Límite:</span> {form.userLimit > 0 ? `${form.userLimit} usuarios` : "Sin límite"}
            </li>
            <li>
              <span className="text-zinc-500">Panel de botones:</span> {form.sendManageEmbed ? "Sí" : "No"}
            </li>
            <li>
              <span className="text-zinc-500">Nombres custom:</span> {form.allowCustomNames ? "Permitidos" : "Desactivados"}
            </li>
          </ul>
        </div>
      </SectionCard>
    </PaneGrid>
  );
}
