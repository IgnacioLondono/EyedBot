"use client";

import { useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { getVerifyConfig, publishVerify, saveVerifyConfig, updateVerifyEmbed } from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
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
  SectionCard,
  Textarea,
} from "@/components/features/shared";
import { asRecord, getErrorMessage, toBooleanValue, toStringValue } from "@/lib/utils";

type VerifyState = {
  enabled: boolean;
  channelId: string;
  roleId: string;
  title: string;
  description: string;
  color: string;
  footer: string;
  imageUrl: string;
};

function normalizeVerify(value: unknown): VerifyState {
  const data = asRecord(value);
  return {
    enabled: toBooleanValue(data.enabled),
    channelId: toStringValue(data.channelId || data.channel_id),
    roleId: toStringValue(data.roleId || data.role_id),
    title: toStringValue(data.title, "Verifica tu acceso"),
    description: toStringValue(data.description || data.message, "Completa el proceso para obtener acceso al servidor."),
    color: toStringValue(data.color, "7c4dff"),
    footer: toStringValue(data.footer),
    imageUrl: toStringValue(data.imageUrl || data.image_url),
  };
}

const VERIFY_TABS = [
  { id: "config", label: "Configuración" },
  { id: "embed", label: "Embed" },
  { id: "media", label: "Imagen" },
];

export function VerifyPane({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { toast } = useToast();
  const [tab, setTab] = useState("config");
  const [form, setForm] = useState<VerifyState>({
    enabled: false,
    channelId: "",
    roleId: "",
    title: "",
    description: "",
    color: "7c4dff",
    footer: "",
    imageUrl: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
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
            <Field label="ID del rol a entregar">
              <Input value={form.roleId} onChange={(event) => setForm((current) => ({ ...current, roleId: event.target.value }))} placeholder="1234567890" />
            </Field>
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
            <Field label="Color embed (hex sin #)">
              <Input value={form.color} onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))} />
            </Field>
            <Field label="Footer">
              <Input value={form.footer} onChange={(event) => setForm((current) => ({ ...current, footer: event.target.value }))} />
            </Field>
          </div>
        ) : null}

        {tab === "media" ? (
          <Field label="URL de imagen del embed">
            <Input value={form.imageUrl} onChange={(event) => setForm((current) => ({ ...current, imageUrl: event.target.value }))} placeholder="https://..." />
          </Field>
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
        <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-100">
            <BadgeCheck className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold text-white">{form.title}</h3>
          <p className="mt-3 text-sm text-zinc-300">{form.description}</p>
          <p className="mt-4 text-sm text-zinc-500">
            Canal: {channels.find((channel) => channel.id === form.channelId)?.name || "Sin canal"} · Rol: {form.roleId || "Sin rol"}
          </p>
        </div>
      </SectionCard>
    </PaneGrid>
  );
}
