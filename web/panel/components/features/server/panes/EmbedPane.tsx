"use client";

import { useEffect, useState } from "react";
import { Layers3, Send, Trash2 } from "lucide-react";
import {
  deleteEmbedTemplate,
  getEmbedTemplates,
  saveEmbedTemplate,
  sendEmbed,
} from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  ChannelSelect,
  Field,
  Input,
  PaneGrid,
  SectionCard,
  Textarea,
} from "@/components/features/shared";
import { asArray, asRecord, getErrorMessage, toStringValue } from "@/lib/utils";

type EmbedForm = {
  channelId: string;
  title: string;
  description: string;
  color: string;
  templateName: string;
};

export function EmbedPane({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { toast } = useToast();
  const [form, setForm] = useState<EmbedForm>({
    channelId: "",
    title: "",
    description: "",
    color: "#8b5cf6",
    templateName: "",
  });
  const [templates, setTemplates] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getEmbedTemplates(guildId)
      .then((payload) => {
        if (!active) return;
        setTemplates(asArray(payload).map((entry) => asRecord(entry)));
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

  async function handleSend() {
    setSending(true);
    try {
      const payload = new FormData();
      payload.append("guildId", guildId);
      payload.append("channelId", form.channelId);
      payload.append("title", form.title);
      payload.append("description", form.description);
      payload.append("color", form.color);
      await sendEmbed(payload);
      toast({ title: "Embed enviado", description: "La publicación fue entregada al canal seleccionado.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo enviar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSending(false);
    }
  }

  async function handleSaveTemplate() {
    setSaving(true);
    try {
      await saveEmbedTemplate({
        guildId,
        name: form.templateName || form.title,
        title: form.title,
        description: form.description,
        color: form.color,
      });
      toast({ title: "Template guardado", description: "La plantilla quedó disponible para reutilizar.", tone: "success" });
      const payload = await getEmbedTemplates(guildId);
      setTemplates(asArray(payload).map((entry) => asRecord(entry)));
    } catch (err) {
      toast({ title: "No se pudo guardar template", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTemplate(templateId: string) {
    try {
      await deleteEmbedTemplate(guildId, templateId);
      toast({ title: "Template eliminado", description: "La plantilla fue removida.", tone: "success" });
      const payload = await getEmbedTemplates(guildId);
      setTemplates(asArray(payload).map((entry) => asRecord(entry)));
    } catch (err) {
      toast({ title: "No se pudo eliminar", description: getErrorMessage(err), tone: "danger" });
    }
  }

  return (
    <PaneGrid>
      <SectionCard title="Constructor de embeds" description="Redacta anuncios visuales y envíalos al instante.">
        <div className="space-y-5">
          <Field label="Canal destino">
            <ChannelSelect value={form.channelId} onChange={(channelId) => setForm((current) => ({ ...current, channelId }))} options={channels} />
          </Field>
          <Field label="Título">
            <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
          </Field>
          <Field label="Descripción">
            <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Color hexadecimal">
              <Input value={form.color} onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))} />
            </Field>
            <Field label="Nombre de plantilla">
              <Input value={form.templateName} onChange={(event) => setForm((current) => ({ ...current, templateName: event.target.value }))} placeholder="Anuncio principal" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void handleSend()} disabled={sending}>
              <Send className="h-4 w-4" />
              {sending ? "Enviando..." : "Enviar embed"}
            </Button>
            <Button variant="secondary" onClick={() => void handleSaveTemplate()} disabled={saving}>
              {saving ? "Guardando..." : "Guardar template"}
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Templates" description="Biblioteca rápida para reutilizar mensajes.">
        {error ? <Alert title="No se pudieron cargar templates" description={error} variant="danger" /> : null}
        {loading ? (
          <Alert title="Cargando templates" description="Buscando plantillas guardadas para este servidor." />
        ) : templates.length ? (
          <div className="space-y-3">
            {templates.map((template, index) => {
              const templateId = toStringValue(template.id || template.templateId, `template-${index}`);
              return (
                <div key={templateId} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{toStringValue(template.name, "Template")}</p>
                      <p className="mt-1 text-sm text-zinc-400">{toStringValue(template.description || template.title, "Sin resumen")}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => void handleDeleteTemplate(templateId)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<Layers3 className="h-6 w-6" />} title="Sin templates" description="Guarda tu primer embed reutilizable desde este constructor." />
        )}
      </SectionCard>
    </PaneGrid>
  );
}
