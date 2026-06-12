"use client";

import { useEffect, useState } from "react";
import { BellRing, Plus, Radio, Trash2 } from "lucide-react";
import {
  getStreamAlertConfig,
  saveStreamAlertConfig,
  testStreamAlert,
} from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { useGuildRoles } from "@/lib/hooks/useGuildRoles";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";
import { Switch } from "@/components/ui/Switch";
import {
  ChannelSelect,
  ColorInput,
  Field,
  FormActions,
  Input,
  PaneGrid,
  RoleSelect,
  SectionCard,
  Select,
  Textarea,
} from "@/components/features/shared";
import { DiscordEmbedPreview } from "@/components/features/embed/EmbedPreview";
import { plainColorToHex } from "@/lib/embed-utils";
import { asArray, asRecord, formatDate, getErrorMessage, toBooleanValue, toStringValue } from "@/lib/utils";

type StreamPlatform = "twitch" | "youtube" | "tiktok" | "custom";

type StreamSource = {
  id: string;
  enabled: boolean;
  platform: StreamPlatform;
  name: string;
  url: string;
  feedUrl: string;
  imageUrl: string;
  lastItemId: string;
  lastPostedAt: string;
};

type StreamAlertState = {
  enabled: boolean;
  channelId: string;
  mentionText: string;
  titleTemplate: string;
  descriptionTemplate: string;
  color: string;
  footerText: string;
  embedLargePreview: boolean;
  sources: StreamSource[];
};

const defaultForm: StreamAlertState = {
  enabled: false,
  channelId: "",
  mentionText: "",
  titleTemplate: "🔴 {platform}: {name} en directo",
  descriptionTemplate: "{title}\n{url}",
  color: "7c4dff",
  footerText: "EyedBot Stream Alerts",
  embedLargePreview: false,
  sources: [],
};

function normalizeSource(entry: unknown, index: number): StreamSource {
  const data = asRecord(entry);
  const platformRaw = toStringValue(data.platform, "custom").toLowerCase();
  const platform = (["twitch", "youtube", "tiktok", "custom"] as const).includes(platformRaw as StreamPlatform)
    ? (platformRaw as StreamPlatform)
    : "custom";

  return {
    id: toStringValue(data.id, `src_${index + 1}`),
    enabled: toBooleanValue(data.enabled, true),
    platform,
    name: toStringValue(data.name, "Fuente"),
    url: toStringValue(data.url),
    feedUrl: toStringValue(data.feedUrl),
    imageUrl: toStringValue(data.imageUrl),
    lastItemId: toStringValue(data.lastItemId),
    lastPostedAt: toStringValue(data.lastPostedAt),
  };
}

function normalizeForm(value: unknown): StreamAlertState {
  const data = asRecord(value);
  return {
    enabled: toBooleanValue(data.enabled),
    channelId: toStringValue(data.channelId),
    mentionText: toStringValue(data.mentionText),
    titleTemplate: toStringValue(data.titleTemplate, defaultForm.titleTemplate),
    descriptionTemplate: toStringValue(data.descriptionTemplate, defaultForm.descriptionTemplate),
    color: toStringValue(data.color, defaultForm.color).replace("#", ""),
    footerText: toStringValue(data.footerText, defaultForm.footerText),
    embedLargePreview: toBooleanValue(data.embedLargePreview),
    sources: asArray(data.sources).map(normalizeSource),
  };
}

function emptySource(): StreamSource {
  return {
    id: `src_${Date.now()}`,
    enabled: true,
    platform: "twitch",
    name: "",
    url: "",
    feedUrl: "",
    imageUrl: "",
    lastItemId: "",
    lastPostedAt: "",
  };
}

export function NotificationsPane({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { roles } = useGuildRoles(guildId);
  const { toast } = useToast();
  const [tab, setTab] = useState("channel");
  const [form, setForm] = useState<StreamAlertState>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getStreamAlertConfig(guildId)
      .then((payload) => setForm(normalizeForm(payload)))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [guildId]);

  function updateSource(index: number, patch: Partial<StreamSource>) {
    setForm((current) => {
      const sources = [...current.sources];
      sources[index] = { ...sources[index], ...patch };
      return { ...current, sources };
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveStreamAlertConfig(guildId, form);
      toast({ title: "Alertas guardadas", description: "La configuración de stream alerts fue actualizada.", tone: "success" });
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

  const previewSource = form.sources.find((source) => source.enabled) || form.sources[0];
  const previewTitle = form.titleTemplate
    .replace("{platform}", previewSource?.platform || "twitch")
    .replace("{name}", previewSource?.name || "Canal");
  const previewDescription = form.descriptionTemplate
    .replace("{title}", previewSource?.name || "En directo")
    .replace("{url}", previewSource?.url || "https://...");

  return (
    <PaneGrid>
      <SectionCard title="Centro de alertas" description="Canales, fuentes en directo y resumen de publicaciones.">
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

        {tab === "channel" ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
              <div>
                <p className="font-medium text-white">Alertas habilitadas</p>
                <p className="text-sm text-zinc-400">Activa publicaciones automáticas en vivo.</p>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(checked) => setForm((c) => ({ ...c, enabled: checked }))} />
            </div>
            <Field label="Canal de publicación">
              <ChannelSelect
                value={form.channelId}
                onChange={(channelId) => setForm((c) => ({ ...c, channelId }))}
                options={channels}
              />
            </Field>
            <Field label="Mención o texto extra">
              <Input
                value={form.mentionText}
                onChange={(event) => setForm((c) => ({ ...c, mentionText: event.target.value }))}
                placeholder="@everyone o mención de rol"
              />
            </Field>
            <Field label="Mencionar rol">
              <RoleSelect
                value=""
                onChange={(roleId) => {
                  if (!roleId) return;
                  setForm((c) => ({ ...c, mentionText: `<@&${roleId}>` }));
                }}
                options={roles}
                placeholder="Elegir rol para mencionar"
              />
            </Field>
            <Field label="Plantilla del título" description="Variables: {platform}, {name}">
              <Input
                value={form.titleTemplate}
                onChange={(event) => setForm((c) => ({ ...c, titleTemplate: event.target.value }))}
              />
            </Field>
            <Field label="Plantilla de descripción" description="Variables: {title}, {url}">
              <Textarea
                value={form.descriptionTemplate}
                onChange={(event) => setForm((c) => ({ ...c, descriptionTemplate: event.target.value }))}
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Color embed">
                <ColorInput value={form.color} onChange={(color) => setForm((c) => ({ ...c, color }))} />
              </Field>
              <Field label="Footer">
                <Input
                  value={form.footerText}
                  onChange={(event) => setForm((c) => ({ ...c, footerText: event.target.value }))}
                />
              </Field>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
              <div>
                <p className="font-medium text-white">Preview grande</p>
                <p className="text-sm text-zinc-400">Usa imagen grande en el embed cuando esté disponible.</p>
              </div>
              <Switch
                checked={form.embedLargePreview}
                onCheckedChange={(checked) => setForm((c) => ({ ...c, embedLargePreview: checked }))}
              />
            </div>
            <FormActions onSave={handleSave} onTest={handleTest} saving={saving} testing={testing} />
          </div>
        ) : null}

        {tab === "stream" || tab === "events" ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-400">
                {tab === "stream"
                  ? "Añade fuentes de Twitch, YouTube, TikTok o URLs personalizadas."
                  : "Activa o desactiva fuentes por plataforma."}
              </p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setForm((c) => ({ ...c, sources: [...c.sources, emptySource()] }))}
              >
                <Plus className="mr-2 h-4 w-4" />
                Añadir fuente
              </Button>
            </div>

            {form.sources.length ? (
              form.sources.map((source, index) => (
                <div key={source.id} className="rounded-2xl border border-white/8 bg-black/20 p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Radio className="h-4 w-4 text-violet-300" />
                      <span className="font-medium text-white">{source.name || `Fuente ${index + 1}`}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={source.enabled}
                        onCheckedChange={(checked) => updateSource(index, { enabled: checked })}
                      />
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          setForm((c) => ({
                            ...c,
                            sources: c.sources.filter((_, i) => i !== index),
                          }))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Plataforma">
                      <Select
                        value={source.platform}
                        onChange={(event) =>
                          updateSource(index, { platform: event.target.value as StreamPlatform })
                        }
                      >
                        <option value="twitch">Twitch</option>
                        <option value="youtube">YouTube</option>
                        <option value="tiktok">TikTok</option>
                        <option value="custom">Custom</option>
                      </Select>
                    </Field>
                    <Field label="Nombre">
                      <Input
                        value={source.name}
                        onChange={(event) => updateSource(index, { name: event.target.value })}
                      />
                    </Field>
                    <Field label="URL principal">
                      <Input
                        value={source.url}
                        onChange={(event) => updateSource(index, { url: event.target.value })}
                        placeholder="https://..."
                      />
                    </Field>
                    <Field label="Feed / RSS">
                      <Input
                        value={source.feedUrl}
                        onChange={(event) => updateSource(index, { feedUrl: event.target.value })}
                        placeholder="https://..."
                      />
                    </Field>
                    {tab === "stream" ? (
                      <Field label="Imagen">
                        <Input
                          value={source.imageUrl}
                          onChange={(event) => updateSource(index, { imageUrl: event.target.value })}
                          placeholder="https://..."
                        />
                      </Field>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="Sin fuentes" description="Añade al menos una fuente para recibir alertas." />
            )}

            <FormActions onSave={handleSave} onTest={handleTest} saving={saving} testing={testing} />
          </div>
        ) : null}

        {tab === "digest" ? (
          <div className="space-y-4">
            {form.sources.length ? (
              form.sources.map((source) => (
                <div
                  key={source.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-white">
                      {source.name || source.id} · {source.platform}
                    </p>
                    <p className="text-sm text-zinc-400">
                      Último item: {source.lastItemId || "N/D"}
                    </p>
                  </div>
                  <div className="text-right text-sm text-zinc-400">
                    <p>{source.enabled ? "Activa" : "Pausada"}</p>
                    <p>{source.lastPostedAt ? formatDate(source.lastPostedAt) : "Sin publicaciones"}</p>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="Sin historial" description="Cuando haya fuentes configuradas verás su último aviso aquí." />
            )}
            <FormActions onSave={handleSave} saving={saving} />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Preview del aviso" description="Tono y destino actual del disparador.">
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20 text-violet-50">
              <BellRing className="h-5 w-5" />
            </div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              {form.mentionText || "Sin mención"} · {form.sources.filter((s) => s.enabled).length} fuentes activas
            </p>
          </div>
          <DiscordEmbedPreview
            title={previewTitle}
            description={previewDescription}
            color={plainColorToHex(form.color)}
            footer={form.footerText}
            imageUrl={form.embedLargePreview ? previewSource?.imageUrl : ""}
            thumbnailUrl={!form.embedLargePreview ? previewSource?.imageUrl : ""}
          />
        </div>
      </SectionCard>
    </PaneGrid>
  );
}
