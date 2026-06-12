"use client";

import { useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { getVerifyConfig, publishVerify, saveVerifyConfig } from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
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
};

function normalizeVerify(value: unknown): VerifyState {
  const data = asRecord(value);
  return {
    enabled: toBooleanValue(data.enabled),
    channelId: toStringValue(data.channelId || data.channel_id),
    roleId: toStringValue(data.roleId || data.role_id),
    title: toStringValue(data.title, "Verifica tu acceso"),
    description: toStringValue(data.description, "Completa el proceso para obtener acceso al servidor."),
  };
}

export function VerifyPane({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { toast } = useToast();
  const [form, setForm] = useState<VerifyState>({
    enabled: false,
    channelId: "",
    roleId: "",
    title: "",
    description: "",
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

  if (loading) return <Alert title="Cargando verificación" description="Consultando el estado del módulo." />;
  if (error) return <Alert title="No se pudo cargar verificación" description={error} variant="danger" />;

  return (
    <PaneGrid>
      <SectionCard title="Panel de verificación" description="Configura el mensaje y la entrega del rol de acceso.">
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

          <Field label="Título">
            <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
          </Field>

          <Field label="Descripción">
            <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
          </Field>

          <div className="flex flex-wrap gap-3">
            <FormActions onSave={handleSave} saving={saving} />
            <Button variant="secondary" onClick={handlePublish} disabled={publishing}>
              {publishing ? "Publicando..." : "Publicar mensaje"}
            </Button>
          </div>
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
