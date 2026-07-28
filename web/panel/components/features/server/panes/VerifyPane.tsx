"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, ShieldCheck } from "lucide-react";
import {
  deleteVerifyImage,
  getVerifyConfig,
  publishVerify,
  saveVerifyConfig,
  syncVerifyPermissions,
  updateVerifyEmbed,
  uploadVerifyImage,
} from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { useGuildRoles } from "@/lib/hooks/useGuildRoles";
import { paneTabKey, usePersistedTab } from "@/lib/hooks/usePersistedTab";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Tabs } from "@/components/ui/Tabs";
import { Switch } from "@/components/ui/Switch";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  ChannelSelect,
  ColorInput,
  Field,
  FormActions,
  Input,
  MultiChannelSelect,
  PaneGrid,
  RoleSelect,
  SectionCard,
  Textarea,
} from "@/components/features/shared";
import { EmbedImageField } from "@/components/features/embed/EmbedImageField";
import { DiscordEmbedPreview } from "@/components/features/embed/EmbedPreview";
import { plainColorToHex } from "@/lib/embed-utils";
import { asRecord, getErrorMessage, toBooleanValue, toStringValue } from "@/lib/utils";

type VerifyMode = "reaction" | "button" | "both";

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
  reassignRoleOnUnreact: boolean;
  verificationMode: VerifyMode;
  restrictedChannelIds: string[];
  minAccountAgeDays: number;
  requireNewMemberRole: boolean;
  lockdownUnverified: boolean;
  hideVerifyFromVerified: boolean;
  logChannelId: string;
  buttonLabel: string;
};

function normalizeVerifyMode(value: unknown): VerifyMode {
  const mode = toStringValue(value, "both").toLowerCase();
  if (mode === "reaction" || mode === "button" || mode === "both") return mode;
  return "both";
}

function normalizeVerify(value: unknown): VerifyState {
  const data = asRecord(value);
  const restrictedRaw = data.restrictedChannelIds || data.restricted_channel_ids;
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
    reassignRoleOnUnreact: data.reassignRoleOnUnreact === false ? false : true,
    verificationMode: normalizeVerifyMode(data.verificationMode || data.verification_mode),
    restrictedChannelIds: Array.isArray(restrictedRaw)
      ? restrictedRaw.map((id) => toStringValue(id)).filter(Boolean)
      : [],
    minAccountAgeDays: Math.max(0, Number.parseInt(toStringValue(data.minAccountAgeDays || data.min_account_age_days, "0"), 10) || 0),
    requireNewMemberRole: data.requireNewMemberRole === false || data.require_new_member_role === false ? false : true,
    lockdownUnverified: data.lockdownUnverified === false || data.lockdown_unverified === false ? false : true,
    hideVerifyFromVerified: data.hideVerifyFromVerified === false || data.hide_verify_from_verified === false ? false : true,
    logChannelId: toStringValue(data.logChannelId || data.log_channel_id),
    buttonLabel: toStringValue(data.buttonLabel || data.button_label, "Verificarme"),
  };
}

function toVerifyPayload(form: VerifyState) {
  return {
    enabled: form.enabled,
    channelId: form.channelId,
    roleId: form.roleId,
    newMemberRoleId: form.newMemberRoleId,
    emoji: form.emoji,
    title: form.title,
    message: form.description,
    color: form.color,
    footer: form.footer,
    imageUrl: form.imageUrl,
    removeRoleOnUnreact: form.removeRoleOnUnreact,
    reassignRoleOnUnreact: form.reassignRoleOnUnreact,
    verificationMode: form.verificationMode,
    restrictedChannelIds: form.restrictedChannelIds,
    minAccountAgeDays: form.minAccountAgeDays,
    requireNewMemberRole: form.requireNewMemberRole,
    lockdownUnverified: form.lockdownUnverified,
    hideVerifyFromVerified: form.hideVerifyFromVerified,
    logChannelId: form.logChannelId,
    buttonLabel: form.buttonLabel,
  };
}

const VERIFY_TABS = [
  { id: "config", label: "Configuración" },
  { id: "acceso", label: "Acceso" },
  { id: "seguridad", label: "Seguridad" },
  { id: "embed", label: "Embed" },
  { id: "media", label: "Imagen" },
];
const VERIFY_TAB_IDS = VERIFY_TABS.map((item) => item.id);

export function VerifyPane({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { roles } = useGuildRoles(guildId);
  const { toast } = useToast();
  const [tab, setTab] = usePersistedTab(paneTabKey(guildId, "verify"), "config", VERIFY_TAB_IDS);
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
    reassignRoleOnUnreact: true,
    verificationMode: "both",
    restrictedChannelIds: [],
    minAccountAgeDays: 0,
    requireNewMemberRole: true,
    lockdownUnverified: true,
    hideVerifyFromVerified: true,
    logChannelId: "",
    buttonLabel: "Verificarme",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [syncingPermissions, setSyncingPermissions] = useState(false);
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
      await saveVerifyConfig(guildId, toVerifyPayload(form));
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
      await saveVerifyConfig(guildId, toVerifyPayload(form));
      await publishVerify(guildId, toVerifyPayload(form));
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
      await saveVerifyConfig(guildId, toVerifyPayload(form));
      await updateVerifyEmbed(guildId, toVerifyPayload(form));
      toast({ title: "Embed actualizado", description: "El mensaje publicado fue editado.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo actualizar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setPublishing(false);
    }
  }

  async function handleSyncPermissions() {
    setSyncingPermissions(true);
    try {
      await saveVerifyConfig(guildId, toVerifyPayload(form));
      const result = asRecord(
        await syncVerifyPermissions(guildId, {
          restrictedChannelIds: form.restrictedChannelIds,
          lockdownUnverified: form.lockdownUnverified,
          hideVerifyFromVerified: form.hideVerifyFromVerified,
          channelId: form.channelId,
        }),
      );
      const synced = Number(result.synced || 0);
      const denied = Number(result.denied || 0);
      const createdChannelId = toStringValue(result.createdChannelId);
      const errors = Array.isArray(result.errors) ? result.errors : [];
      const config = asRecord(result.config);
      if (Object.keys(config).length) {
        setForm(normalizeVerify(config));
      }
      const parts = [`Permitidos: ${synced}`];
      if (denied > 0) parts.push(`ocultos: ${denied}`);
      if (createdChannelId) parts.push("se creó #verificacion");
      toast({
        title: "Puerta de verificación aplicada",
        description:
          errors.length > 0
            ? `${parts.join(" · ")}. ${errors.length} canal(es) fallaron.`
            : `${parts.join(" · ")}.`,
        tone: errors.length > 0 ? "warning" : "success",
      });
    } catch (err) {
      toast({ title: "No se pudo sincronizar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSyncingPermissions(false);
    }
  }

  if (loading) return <Alert title="Cargando verificación" description="Consultando el estado del módulo." />;
  if (error) return <Alert title="No se pudo cargar verificación" description={error} variant="danger" />;

  const selectableChannels = channels.filter((channel) => channel.botCanAccess !== false);

  return (
    <PaneGrid>
      <SectionCard title="Panel de verificación" description="Configura el mensaje, los roles y el acceso inicial al servidor.">
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
            <Field label="Rol inicial de nuevo miembro" description="Se asigna al entrar y limita qué canales puede ver hasta verificarse.">
              <RoleSelect
                value={form.newMemberRoleId}
                onChange={(newMemberRoleId) => setForm((current) => ({ ...current, newMemberRoleId }))}
                options={roles}
                placeholder="Sin rol inicial"
              />
            </Field>
            <Field label="Modo de verificación" description="El botón es más seguro: no depende de reacciones y evita bots de reacción.">
              <Select
                value={form.verificationMode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    verificationMode: normalizeVerifyMode(event.target.value),
                  }))
                }
              >
                <option value="button">Solo botón</option>
                <option value="reaction">Solo reacción</option>
                <option value="both">Botón y reacción</option>
              </Select>
            </Field>
            {form.verificationMode !== "button" ? (
              <Field label="Emoji de reacción">
                <Input value={form.emoji} onChange={(event) => setForm((current) => ({ ...current, emoji: event.target.value }))} placeholder="✅" />
              </Field>
            ) : null}
            {form.verificationMode !== "reaction" ? (
              <Field label="Texto del botón">
                <Input
                  value={form.buttonLabel}
                  onChange={(event) => setForm((current) => ({ ...current, buttonLabel: event.target.value }))}
                  placeholder="Verificarme"
                />
              </Field>
            ) : null}
          </div>
        ) : null}

        {tab === "acceso" ? (
          <div className="space-y-5">
            <Alert
              title="Puerta de acceso"
              description="Con el bloqueo activo, quienes tengan el rol sin verificar no verán el resto del servidor: solo el canal de verificación (y los extras que elijas). Si no hay canal elegido, el bot crea #verificacion privado."
            />
            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
              <div>
                <p className="font-medium text-white">Ocultar el resto del servidor</p>
                <p className="text-sm text-zinc-400">Niega «Ver canal» al rol sin verificar en todos los canales excepto los permitidos.</p>
              </div>
              <Switch
                checked={form.lockdownUnverified}
                onCheckedChange={(lockdownUnverified) => setForm((current) => ({ ...current, lockdownUnverified }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
              <div>
                <p className="font-medium text-white">Canal invisible para verificados</p>
                <p className="text-sm text-zinc-400">El canal de verificación queda oculto a @everyone y al rol verificado; solo lo ven los no verificados.</p>
              </div>
              <Switch
                checked={form.hideVerifyFromVerified}
                onCheckedChange={(hideVerifyFromVerified) => setForm((current) => ({ ...current, hideVerifyFromVerified }))}
              />
            </div>
            <Field
              label="Canales visibles sin verificar"
              description="Opcional: reglas o bienvenida. El canal de verificación se incluye solo. Si está vacío y no hay canal, se crea #verificacion."
            >
              <MultiChannelSelect
                value={form.restrictedChannelIds}
                onChange={(restrictedChannelIds) => setForm((current) => ({ ...current, restrictedChannelIds }))}
                options={selectableChannels}
              />
            </Field>
            <Button variant="secondary" onClick={() => void handleSyncPermissions()} disabled={syncingPermissions || !form.newMemberRoleId}>
              {syncingPermissions ? "Aplicando puerta..." : "Aplicar puerta de verificación"}
            </Button>
          </div>
        ) : null}

        {tab === "seguridad" ? (
          <div className="space-y-5">
            <Field label="Antigüedad mínima de cuenta (días)" description="0 desactiva esta comprobación. Recomendado: 3-7 días contra cuentas nuevas.">
              <Input
                type="number"
                min={0}
                max={365}
                value={String(form.minAccountAgeDays)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    minAccountAgeDays: Math.max(0, Math.min(365, Number.parseInt(event.target.value || "0", 10) || 0)),
                  }))
                }
              />
            </Field>
            <Field label="Canal de registros" description="Opcional. El bot enviará un aviso cuando alguien se verifique o pierda acceso.">
              <ChannelSelect
                value={form.logChannelId}
                onChange={(logChannelId) => setForm((current) => ({ ...current, logChannelId }))}
                options={channels}
                placeholder="Sin canal de logs"
              />
            </Field>
            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
              <div>
                <p className="font-medium text-white">Exigir rol sin verificar</p>
                <p className="text-sm text-zinc-400">Solo pueden verificarse miembros que tengan el rol inicial asignado.</p>
              </div>
              <Switch
                checked={form.requireNewMemberRole}
                onCheckedChange={(requireNewMemberRole) => setForm((current) => ({ ...current, requireNewMemberRole }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
              <div>
                <p className="font-medium text-white">Quitar rol al quitar reacción</p>
                <p className="text-sm text-zinc-400">Revoca el acceso si el usuario elimina la reacción (solo modo reacción).</p>
              </div>
              <Switch
                checked={form.removeRoleOnUnreact}
                onCheckedChange={(removeRoleOnUnreact) => setForm((current) => ({ ...current, removeRoleOnUnreact }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
              <div>
                <p className="font-medium text-white">Restaurar rol sin verificar al desverificar</p>
                <p className="text-sm text-zinc-400">Vuelve a asignar el rol inicial si pierden la verificación.</p>
              </div>
              <Switch
                checked={form.reassignRoleOnUnreact}
                onCheckedChange={(reassignRoleOnUnreact) => setForm((current) => ({ ...current, reassignRoleOnUnreact }))}
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
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            <p className="text-sm text-zinc-300">
              Modo: {form.verificationMode === "both" ? "Botón y reacción" : form.verificationMode === "button" ? "Solo botón" : "Solo reacción"}
              {form.minAccountAgeDays > 0 ? ` · Cuenta mínima: ${form.minAccountAgeDays} días` : ""}
              {form.restrictedChannelIds.length > 0 ? ` · ${form.restrictedChannelIds.length} canal(es) sin verificar` : ""}
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
