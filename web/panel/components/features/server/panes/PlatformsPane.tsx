"use client";

import { useEffect, useMemo, useState } from "react";
import { Gamepad2, Plus, Trash2 } from "lucide-react";
import {
  getPlatformsConfig,
  publishPlatforms,
  savePlatformsConfig,
  updatePlatformsEmbed,
  uploadPlatformsEmojis,
} from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { useGuildRoles } from "@/lib/hooks/useGuildRoles";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import {
  ChannelSelect,
  ColorInput,
  Field,
  Input,
  PaneGrid,
  RoleSelect,
  SectionCard,
  Textarea,
} from "@/components/features/shared";
import { DiscordEmbedPreview } from "@/components/features/embed/EmbedPreview";
import { plainColorToHex } from "@/lib/embed-utils";
import { asRecord, getErrorMessage, toBooleanValue, toStringValue } from "@/lib/utils";

type PlatformItem = {
  id: string;
  label: string;
  emoji: string;
  roleId: string;
  enabled: boolean;
};

type PlatformsState = {
  enabled: boolean;
  channelId: string;
  messageId: string;
  title: string;
  message: string;
  color: string;
  footer: string;
  mode: "buttons" | "select";
  exclusive: boolean;
  platforms: PlatformItem[];
};

const DEFAULT_PLATFORMS: PlatformItem[] = [
  { id: "pc", label: "PC", emoji: "🖥️", roleId: "", enabled: true },
  { id: "playstation", label: "PlayStation", emoji: "🎮", roleId: "", enabled: true },
  { id: "xbox", label: "Xbox", emoji: "🟩", roleId: "", enabled: true },
  { id: "nintendo", label: "Nintendo Switch", emoji: "🕹️", roleId: "", enabled: true },
  { id: "steam", label: "Steam", emoji: "💨", roleId: "", enabled: true },
];

function normalizePlatform(raw: unknown): PlatformItem | null {
  const data = asRecord(raw);
  const id = toStringValue(data.id)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
  if (!id) return null;
  return {
    id,
    label: toStringValue(data.label, id).slice(0, 80) || id,
    emoji: toStringValue(data.emoji).slice(0, 80),
    roleId: toStringValue(data.roleId || data.role_id),
    enabled: data.enabled === false ? false : true,
  };
}

function normalizeConfig(value: unknown): PlatformsState {
  const data = asRecord(value);
  const list = Array.isArray(data.platforms)
    ? data.platforms.map(normalizePlatform).filter((p): p is PlatformItem => Boolean(p))
    : DEFAULT_PLATFORMS;
  return {
    enabled: toBooleanValue(data.enabled, true),
    channelId: toStringValue(data.channelId || data.channel_id),
    messageId: toStringValue(data.messageId || data.message_id),
    title: toStringValue(data.title, "¿En qué jugás?"),
    message: toStringValue(
      data.message,
      "Elegí tus plataformas para que la comunidad sepa dónde encontrarte.\nPodés marcar más de una."
    ),
    color: toStringValue(data.color, "7c4dff"),
    footer: toStringValue(data.footer, "Tocá un botón para añadir o quitar el rol"),
    mode: toStringValue(data.mode, "buttons").toLowerCase() === "select" ? "select" : "buttons",
    exclusive: data.exclusive === true,
    platforms: list.length ? list : DEFAULT_PLATFORMS.map((p) => ({ ...p })),
  };
}

function toPayload(form: PlatformsState) {
  return {
    enabled: form.enabled,
    channelId: form.channelId,
    messageId: form.messageId,
    title: form.title,
    message: form.message,
    color: form.color,
    footer: form.footer,
    mode: form.mode,
    exclusive: form.exclusive,
    platforms: form.platforms,
  };
}

export function PlatformsPane({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { roles } = useGuildRoles(guildId);
  const { toast } = useToast();
  const [form, setForm] = useState<PlatformsState>(() => normalizeConfig({}));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [uploadingEmojis, setUploadingEmojis] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getPlatformsConfig(guildId)
      .then((payload) => setForm(normalizeConfig(payload)))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [guildId]);

  const previewDescription = useMemo(() => {
    const lines = form.platforms
      .filter((p) => p.enabled)
      .map((p) => `${p.emoji || "•"} **${p.label}**`);
    return [form.message, lines.length ? `\n${lines.join("\n")}` : ""].filter(Boolean).join("\n");
  }, [form.message, form.platforms]);

  function patchPlatform(id: string, patch: Partial<PlatformItem>) {
    setForm((current) => ({
      ...current,
      platforms: current.platforms.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }

  function addCustomPlatform() {
    const id = `custom_${Date.now().toString(36)}`.slice(0, 32);
    setForm((current) => ({
      ...current,
      platforms: [
        ...current.platforms,
        { id, label: "Nuevo juego", emoji: "🎯", roleId: "", enabled: true },
      ].slice(0, 25),
    }));
  }

  function removePlatform(id: string) {
    setForm((current) => ({
      ...current,
      platforms: current.platforms.filter((p) => p.id !== id),
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await savePlatformsConfig(guildId, toPayload(form));
      setForm(normalizeConfig(saved));
      toast({ title: "Plataformas guardadas", description: "La configuración quedó actualizada.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadEmojis() {
    setUploadingEmojis(true);
    try {
      await savePlatformsConfig(guildId, toPayload(form));
      const result = asRecord(await uploadPlatformsEmojis(guildId));
      const cfg = asRecord(result.config);
      if (Object.keys(cfg).length) setForm(normalizeConfig(cfg));
      const uploaded = Array.isArray(result.uploaded) ? result.uploaded.length : 0;
      toast({
        title: "Emojis listos",
        description: uploaded
          ? `Se subieron ${uploaded} emoji(s) del pack al servidor.`
          : "Se reutilizaron emojis existentes o no había archivos nuevos.",
        tone: "success",
      });
    } catch (err) {
      toast({ title: "No se pudieron subir emojis", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setUploadingEmojis(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      await savePlatformsConfig(guildId, toPayload(form));
      const result = asRecord(await publishPlatforms(guildId));
      const cfg = asRecord(result.config);
      if (Object.keys(cfg).length) setForm(normalizeConfig(cfg));
      toast({ title: "Panel publicado", description: "El mensaje de plataformas está en el canal.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo publicar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setPublishing(false);
    }
  }

  async function handleUpdate() {
    setUpdating(true);
    try {
      await savePlatformsConfig(guildId, toPayload(form));
      const result = asRecord(await updatePlatformsEmbed(guildId));
      const cfg = asRecord(result.config);
      if (Object.keys(cfg).length) setForm(normalizeConfig(cfg));
      toast({ title: "Panel actualizado", description: "Se editó el mensaje publicado.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo actualizar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--theme-text-secondary)]">Cargando plataformas…</p>;
  }

  return (
    <PaneGrid>
      {error ? <Alert title="Error" description={error} variant="danger" /> : null}

      <SectionCard
        title="Panel de plataformas"
        description="Los miembros eligen PC, PlayStation, Xbox, Switch, Steam u otros juegos con botones e iconos."
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Gamepad2 className="h-5 w-5 text-[color:var(--color-accent)]" />
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">Módulo activo</p>
              <p className="text-xs text-[var(--theme-text-secondary)]">Si está off, los botones no asignan roles.</p>
            </div>
          </div>
          <Switch checked={form.enabled} onCheckedChange={(enabled) => setForm((c) => ({ ...c, enabled }))} />
        </div>

        <Field label="Canal del panel">
          <ChannelSelect
            options={channels}
            value={form.channelId}
            onChange={(channelId) => setForm((c) => ({ ...c, channelId }))}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Estilo de interacción">
            <Select
              value={form.mode}
              onChange={(e) =>
                setForm((c) => ({
                  ...c,
                  mode: e.target.value === "select" ? "select" : "buttons",
                }))
              }
            >
              <option value="buttons">Botones (recomendado)</option>
              <option value="select">Menú desplegable</option>
            </Select>
          </Field>
          <Field label="Solo una plataforma">
            <div className="flex h-11 items-center justify-between rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-strong)] px-3">
              <span className="text-sm text-[var(--theme-text-secondary)]">Modo exclusivo</span>
              <Switch
                checked={form.exclusive}
                onCheckedChange={(exclusive) => setForm((c) => ({ ...c, exclusive }))}
              />
            </div>
          </Field>
        </div>

        {form.messageId ? (
          <p className="text-xs text-[var(--theme-text-secondary)]">
            Mensaje publicado: <code className="rounded bg-[var(--color-surface-strong)] px-1">{form.messageId}</code>
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="Plataformas y roles" description="Asigná un rol de Discord a cada opción. Subí el pack para iconos originales.">
        <div className="space-y-3">
          {form.platforms.map((platform) => (
            <div
              key={platform.id}
              className="grid gap-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3 sm:grid-cols-[auto_1fr_1fr_1.2fr_auto]"
            >
              <div className="flex items-center gap-2">
                <Switch
                  checked={platform.enabled}
                  onCheckedChange={(enabled) => patchPlatform(platform.id, { enabled })}
                />
                <span className="text-lg leading-none">{platform.emoji || "•"}</span>
              </div>
              <Field label="Nombre">
                <Input
                  value={platform.label}
                  onChange={(e) => patchPlatform(platform.id, { label: e.target.value })}
                />
              </Field>
              <Field label="Emoji" description="Unicode o <:nombre:id>">
                <Input
                  value={platform.emoji}
                  onChange={(e) => patchPlatform(platform.id, { emoji: e.target.value })}
                  placeholder="🖥️ o <:pc:123>"
                />
              </Field>
              <Field label="Rol">
                <RoleSelect
                  options={roles}
                  value={platform.roleId}
                  onChange={(roleId) => patchPlatform(platform.id, { roleId })}
                />
              </Field>
              <div className="flex items-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => removePlatform(platform.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={addCustomPlatform}>
            <Plus className="mr-1.5 h-4 w-4" />
            Añadir opción
          </Button>
          <Button type="button" variant="secondary" size="sm" loading={uploadingEmojis} onClick={() => void handleUploadEmojis()}>
            Subir emojis del pack
          </Button>
        </div>
        <p className="text-xs text-[var(--theme-text-secondary)]">
          El pack incluye PC, PlayStation, Xbox, Switch y Steam. El bot necesita permiso de gestionar emojis.
        </p>
      </SectionCard>

      <SectionCard title="Texto del embed">
        <Field label="Título">
          <Input value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} />
        </Field>
        <Field label="Descripción">
          <Textarea
            rows={4}
            value={form.message}
            onChange={(e) => setForm((c) => ({ ...c, message: e.target.value }))}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Color">
            <ColorInput value={form.color} onChange={(color) => setForm((c) => ({ ...c, color }))} />
          </Field>
          <Field label="Footer">
            <Input value={form.footer} onChange={(e) => setForm((c) => ({ ...c, footer: e.target.value }))} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Vista previa">
        <DiscordEmbedPreview
          title={form.title || "Sin título"}
          description={previewDescription || "Sin descripción"}
          color={plainColorToHex(form.color)}
          footer={form.footer}
        />
      </SectionCard>

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" loading={saving} onClick={() => void handleSave()}>
          Guardar
        </Button>
        <Button type="button" loading={publishing} onClick={() => void handlePublish()}>
          Publicar panel
        </Button>
        <Button
          type="button"
          variant="ghost"
          loading={updating}
          disabled={!form.messageId}
          onClick={() => void handleUpdate()}
        >
          Actualizar mensaje
        </Button>
      </div>
    </PaneGrid>
  );
}
