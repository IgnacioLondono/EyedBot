"use client";

import { useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import {
  deleteVerifyImage,
  getVerifyConfig,
  publishVerify,
  saveVerifyConfig,
  updateVerifyEmbed,
  uploadVerifyImage,
} from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { useGuildRoles } from "@/lib/hooks/useGuildRoles";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Tabs } from "@/components/ui/Tabs";
import { Switch } from "@/components/ui/Switch";
import { Button } from "@/components/ui/Button";
import {
  ChannelSelect,
  ColorInput,
  Field,
  FormActions,
  Input,
  PaneGrid,
  RoleSelect,
  SectionCard,
  Textarea,
} from "@/components/features/shared";
import { EmbedImageField } from "@/components/features/embed/EmbedImageField";
import { DiscordEmbedPreview } from "@/components/features/embed/EmbedPreview";
import { plainColorToHex } from "@/lib/embed-utils";
import { asRecord, getErrorMessage, toBooleanValue, toStringValue } from "@/lib/utils";

type VerifyState = {
  enabled: boolean;
  channelId: string;
  roleId: string;
  newMemberRoleId: string;
  emoji: string;
  title: string;
  description: string;
  color: string;
  footer: string;
  imageUrl: string;
  removeRoleOnUnreact: boolean;
};

function normalizeVerify(value: unknown): VerifyState {
  const data = asRecord(value);
  return {
    enabled: toBooleanValue(data.enabled),
    channelId: toStringValue(data.channelId || data.channel_id),
    roleId: toStringValue(data.roleId || data.role_id),
    newMemberRoleId: toStringValue(data.newMemberRoleId || data.new_member_role_id),
    emoji: toStringValue(data.emoji, "✅"),
    title: toStringValue(data.title, "Verifica tu acceso"),
    description: toStringValue(data.description || data.message, "Completa el proceso para obtener acceso al servidor."),
    color: toStringValue(data.color, "7c4dff"),
    footer: toStringValue(data.footer),
    imageUrl: toStringValue(data.imageUrl || data.image_url),
    removeRoleOnUnreact: toBooleanValue(data.removeRoleOnUnreact),
  };
}

const VERIFY_TABS = [
  { id: "config", label: "Configuración" },
  { id: "embed", label: "Embed" },
  { id: "media", label: "Imagen" },
];

export function VerifyPane({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { roles } = useGuildRoles(guildId);
  const { toast } = useToast();
  const [tab, setTab] = useState("config");
  const [form, setForm] = useState<VerifyState>({
    enabled: false,
    channelId: "",
    roleId: "",
    newMemberRoleId: "",
    emoji: "✅",
    title: "",
    description: "",
    color: "7c4dff",
    footer: "",
    imageUrl: "",
    removeRoleOnUnreact: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [deletingImage, setDeletingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getVerifyConfig(guildId)
      .then((payload) => setForm(normalizeVerify(payload)))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [guildId]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveVerifyConfig(guildId, form);
      toast({ title: "Verificación guardada", description: "El flujo de acceso quedó actualizado.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      await publishVerify(guildId, form);
      toast({ title: "Mensaje publicado", description: "La publicación de verificación fue enviada.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo publicar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setPublishing(false);
    }
  }

  async function handleUpdateEmbed() {
    setPublishing(true);
    try {
      await updateVerifyEmbed(guildId, form);
      toast({ title: "Embed actualizado", description: "El mensaje publicado fue editado.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo actualizar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setPublishing(false);
    }
  }

  if (loading) return <Alert title="Cargando verificación" description="Consultando el estado del módulo." />;
  if (error) return <Alert title="No se pudo cargar verificación" description={error} variant="danger" />;

  return (
    <PaneGrid>
      <SectionCard title="Panel de verificación" description="Configura el mensaje y la entrega del rol de acceso.">
        <Tabs items={VERIFY_TABS} value={tab} onValueChange={setTab} className="mb-5" />

        {tab === "config" ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
              <div>
                <p className="font-medium text-white">Activar verificación</p>
                <p className="text-sm text-zinc-400">Protege el acceso inicial al servidor.</p>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))} />
            </div>
            <Field label="Canal de publicación">
              <ChannelSelect value={form.channelId} onChange={(channelId) => setForm((current) => ({ ...current, channelId }))} options={channels} />
            </Field>
            <Field label="Rol al verificar">
              <RoleSelect value={form.roleId} onChange={(roleId) => setForm((current) => ({ ...current, roleId }))} options={roles} />
            </Field>
            <Field label="Rol inicial de nuevo miembro" description="Opcional. Se quita al verificar.">
              <RoleSelect
                value={form.newMemberRoleId}
                onChange={(newMemberRoleId) => setForm((current) => ({ ...current, newMemberRoleId }))}
                options={roles}
                placeholder="Sin rol inicial"
              />
            </Field>
            <Field label="Emoji de reacción">
              <Input value={form.emoji} onChange={(event) => setForm((current) => ({ ...current, emoji: event.target.value }))} placeholder="✅" />
            </Field>
            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
              <div>
                <p className="font-medium text-white">Quitar rol al quitar reacción</p>
                <p className="text-sm text-zinc-400">Revoca el acceso si el usuario elimina la reacción.</p>
              </div>
              <Switch
                checked={form.removeRoleOnUnreact}
                onCheckedChange={(removeRoleOnUnreact) => setForm((current) => ({ ...current, removeRoleOnUnreact }))}
              />
            </div>
          </div>
        ) : null}

        {tab === "embed" ? (
          <div className="space-y-5">
            <Field label="Título">
              <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
            </Field>
            <Field label="Descripción">
              <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </Field>
            <Field label="Color del embed">
              <ColorInput value={form.color} onChange={(color) => setForm((current) => ({ ...current, color }))} />
            </Field>
            <Field label="Footer">
              <Input value={form.footer} onChange={(event) => setForm((current) => ({ ...current, footer: event.target.value }))} />
            </Field>
          </div>
        ) : null}

        {tab === "media" ? (
          <EmbedImageField
            label="Imagen del embed"
            description="URL externa o archivo subido al panel."
            value={form.imageUrl}
            onChange={(imageUrl) => setForm((current) => ({ ...current, imageUrl }))}
            uploading={uploadingImage}
            deleting={deletingImage}
            onUpload={async (file) => {
              setUploadingImage(true);
              try {
                const result = asRecord(await uploadVerifyImage(guildId, file));
                const config = asRecord(result.config);
                if (Object.keys(config).length) {
                  setForm(normalizeVerify(config));
                } else {
                  const imageUrl = toStringValue(result.path || result.url);
                  setForm((current) => ({ ...current, imageUrl }));
                }
                toast({ title: "Imagen subida", description: "La imagen de verificación fue guardada.", tone: "success" });
              } catch (err) {
                toast({ title: "No se pudo subir", description: getErrorMessage(err), tone: "danger" });
              } finally {
                setUploadingImage(false);
              }
            }}
            onDelete={async () => {
              setDeletingImage(true);
              try {
                const result = asRecord(await deleteVerifyImage(guildId));
                const config = asRecord(result.config);
                setForm(normalizeVerify(config));
                toast({ title: "Imagen eliminada", description: "Se quitó la imagen del embed.", tone: "success" });
              } catch (err) {
                toast({ title: "No se pudo eliminar", description: getErrorMessage(err), tone: "danger" });
              } finally {
                setDeletingImage(false);
              }
            }}
          />
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <FormActions onSave={handleSave} saving={saving} />
          <Button variant="secondary" onClick={() => void handlePublish()} disabled={publishing}>
            {publishing ? "Publicando..." : "Publicar mensaje"}
          </Button>
          <Button variant="secondary" onClick={() => void handleUpdateEmbed()} disabled={publishing}>
            Actualizar embed
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Resumen de acceso" description="Previsualización del mensaje principal y destino.">
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20 text-violet-100">
              <BadgeCheck className="h-5 w-5" />
            </div>
            <p className="text-sm text-zinc-400">
              Canal: {channels.find((channel) => channel.id === form.channelId)?.name || "Sin canal"} · Rol:{" "}
              {roles.find((role) => role.id === form.roleId)?.name || "Sin rol"}
            </p>
          </div>
          <DiscordEmbedPreview
            title={form.title}
            description={form.description}
            color={plainColorToHex(form.color)}
            footer={form.footer}
            imageUrl={form.imageUrl}
          />
        </div>
      </SectionCard>
    </PaneGrid>
  );
}
