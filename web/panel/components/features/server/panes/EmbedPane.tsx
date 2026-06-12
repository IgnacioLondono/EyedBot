"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Layers3, Plus, Send, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/Switch";
import { EmbedPreview } from "@/components/features/embed/EmbedPreview";
import {
  ChannelSelect,
  ColorInput,
  Field,
  Input,
  PaneGrid,
  SectionCard,
  Textarea,
} from "@/components/features/shared";
import {
  buildEmbedPayload,
  DEFAULT_EMBED_FORM,
  embedToFormState,
  type EmbedFormState,
} from "@/lib/embed-utils";
import { asArray, asRecord, getErrorMessage, toStringValue } from "@/lib/utils";

export function EmbedPane({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { toast } = useToast();
  const imageFileRef = useRef<HTMLInputElement>(null);
  const thumbnailFileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<EmbedFormState>(DEFAULT_EMBED_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState("");
  const [templates, setTemplates] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reloadTemplates() {
    const payload = await getEmbedTemplates(guildId);
    setTemplates(asArray(payload).map((entry) => asRecord(entry)));
  }

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!thumbnailFile) {
      setThumbnailPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(thumbnailFile);
    setThumbnailPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbnailFile]);

  useEffect(() => {
    let active = true;
    void reloadTemplates()
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

  function patchForm(patch: Partial<EmbedFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function loadTemplate(template: Record<string, unknown>) {
    const embed = asRecord(template.embed);
    setForm((current) =>
      embedToFormState(embed, {
        ...current,
        templateName: toStringValue(template.name, current.templateName),
      })
    );
    setImageFile(null);
    setThumbnailFile(null);
    toast({ title: "Plantilla cargada", description: "El editor se rellenó con la plantilla seleccionada.", tone: "success" });
  }

  async function handleSend() {
    if (!form.channelId) {
      toast({ title: "Falta canal", description: "Selecciona un canal de destino.", tone: "danger" });
      return;
    }

    setSending(true);
    try {
      const payload = new FormData();
      payload.append("guildId", guildId);
      payload.append("channelId", form.channelId);
      if (form.messageId.trim()) payload.append("messageId", form.messageId.trim());
      payload.append("embed", JSON.stringify(buildEmbedPayload(form)));
      if (imageFile) payload.append("imageFile", imageFile);
      if (thumbnailFile) payload.append("thumbnailFile", thumbnailFile);

      await sendEmbed(payload);
      toast({
        title: form.messageId.trim() ? "Mensaje actualizado" : "Embed enviado",
        description: form.messageId.trim()
          ? "El mensaje del bot fue editado en Discord."
          : "La publicación fue entregada al canal seleccionado.",
        tone: "success",
      });
    } catch (err) {
      toast({ title: "No se pudo enviar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSending(false);
    }
  }

  async function handleSaveTemplate() {
    const name = (form.templateName || form.title).trim();
    if (!name) {
      toast({ title: "Falta nombre", description: "Indica un nombre para la plantilla.", tone: "danger" });
      return;
    }

    setSaving(true);
    try {
      await saveEmbedTemplate({
        guildId,
        name,
        embed: buildEmbedPayload(form),
      });
      toast({ title: "Template guardado", description: "La plantilla quedó disponible para reutilizar.", tone: "success" });
      await reloadTemplates();
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
      await reloadTemplates();
    } catch (err) {
      toast({ title: "No se pudo eliminar", description: getErrorMessage(err), tone: "danger" });
    }
  }

  return (
    <PaneGrid>
      <SectionCard title="Constructor de embeds" description="Crea embeds completos, edita mensajes del bot o guarda plantillas.">
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Canal destino">
              <ChannelSelect value={form.channelId} onChange={(channelId) => patchForm({ channelId })} options={channels} />
            </Field>
            <Field label="ID de mensaje (opcional)" description="Si lo rellenas, se editará ese mensaje del bot.">
              <Input
                value={form.messageId}
                onChange={(event) => patchForm({ messageId: event.target.value })}
                placeholder="1234567890123456789"
              />
            </Field>
          </div>

          <Field label="Título">
            <Input value={form.title} onChange={(event) => patchForm({ title: event.target.value })} />
          </Field>
          <Field label="Descripción">
            <Textarea
              value={form.description}
              onChange={(event) => patchForm({ description: event.target.value })}
              rows={5}
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Color">
              <ColorInput value={form.color} onChange={(color) => patchForm({ color })} format="hash" />
            </Field>
            <Field label="Footer">
              <Input value={form.footer} onChange={(event) => patchForm({ footer: event.target.value })} />
            </Field>
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/20 p-4 space-y-4">
            <p className="text-sm font-medium text-white">Autor</p>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Nombre">
                <Input value={form.authorName} onChange={(event) => patchForm({ authorName: event.target.value })} />
              </Field>
              <Field label="Icono URL">
                <Input value={form.authorIconUrl} onChange={(event) => patchForm({ authorIconUrl: event.target.value })} />
              </Field>
              <Field label="Enlace">
                <Input value={form.authorUrl} onChange={(event) => patchForm({ authorUrl: event.target.value })} />
              </Field>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Imagen (URL)">
              <Input value={form.imageUrl} onChange={(event) => patchForm({ imageUrl: event.target.value })} placeholder="https://..." />
            </Field>
            <Field label="Miniatura (URL)">
              <Input
                value={form.thumbnailUrl}
                onChange={(event) => patchForm({ thumbnailUrl: event.target.value })}
                placeholder="https://..."
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Subir imagen principal">
              <input
                ref={imageFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => setImageFile(event.target.files?.[0] || null)}
              />
              <Button variant="secondary" onClick={() => imageFileRef.current?.click()}>
                {imageFile ? imageFile.name : "Elegir archivo"}
              </Button>
            </Field>
            <Field label="Subir miniatura">
              <input
                ref={thumbnailFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => setThumbnailFile(event.target.files?.[0] || null)}
              />
              <Button variant="secondary" onClick={() => thumbnailFileRef.current?.click()}>
                {thumbnailFile ? thumbnailFile.name : "Elegir archivo"}
              </Button>
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
            <div>
              <p className="font-medium text-white">Marca de tiempo</p>
              <p className="text-sm text-zinc-400">Muestra la hora actual en el pie del embed.</p>
            </div>
            <Switch checked={form.timestamp} onCheckedChange={(timestamp) => patchForm({ timestamp })} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white">Campos</p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => patchForm({ fields: [...form.fields, { name: "", value: "", inline: false }] })}
              >
                <Plus className="mr-1 h-4 w-4" />
                Añadir campo
              </Button>
            </div>
            {form.fields.map((field, index) => (
              <div key={`field-${index}`} className="rounded-2xl border border-white/8 bg-black/20 p-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Nombre">
                    <Input
                      value={field.name}
                      onChange={(event) => {
                        const fields = [...form.fields];
                        fields[index] = { ...fields[index], name: event.target.value };
                        patchForm({ fields });
                      }}
                    />
                  </Field>
                  <div className="flex items-end justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={field.inline}
                        onChange={(event) => {
                          const fields = [...form.fields];
                          fields[index] = { ...fields[index], inline: event.target.checked };
                          patchForm({ fields });
                        }}
                        className="accent-violet-500"
                      />
                      En línea
                    </label>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => patchForm({ fields: form.fields.filter((_, i) => i !== index) })}
                    >
                      Quitar
                    </Button>
                  </div>
                </div>
                <Field label="Valor">
                  <Textarea
                    value={field.value}
                    onChange={(event) => {
                      const fields = [...form.fields];
                      fields[index] = { ...fields[index], value: event.target.value };
                      patchForm({ fields });
                    }}
                    rows={3}
                  />
                </Field>
              </div>
            ))}
          </div>

          <Field label="Nombre de plantilla">
            <Input
              value={form.templateName}
              onChange={(event) => patchForm({ templateName: event.target.value })}
              placeholder="Anuncio principal"
            />
          </Field>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void handleSend()} disabled={sending}>
              <Send className="h-4 w-4" />
              {sending ? "Enviando..." : form.messageId.trim() ? "Actualizar mensaje" : "Enviar embed"}
            </Button>
            <Button variant="secondary" onClick={() => void handleSaveTemplate()} disabled={saving}>
              {saving ? "Guardando..." : "Guardar template"}
            </Button>
          </div>
        </div>
      </SectionCard>

      <div className="space-y-5">
        <SectionCard title="Vista previa" description="Así se verá aproximadamente en Discord.">
          <EmbedPreview
            form={form}
            imageOverride={imagePreviewUrl || undefined}
            thumbnailOverride={thumbnailPreviewUrl || undefined}
          />
        </SectionCard>

        <SectionCard title="Templates" description="Biblioteca rápida para reutilizar mensajes.">
          {error ? <Alert title="No se pudieron cargar templates" description={error} variant="danger" /> : null}
          {loading ? (
            <Alert title="Cargando templates" description="Buscando plantillas guardadas para este servidor." />
          ) : templates.length ? (
            <div className="space-y-3">
              {templates.map((template, index) => {
                const templateId = toStringValue(template.id || template.templateId, `template-${index}`);
                const embed = asRecord(template.embed);
                return (
                  <div key={templateId} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-white">{toStringValue(template.name, "Template")}</p>
                        <p className="mt-1 truncate text-sm text-zinc-400">
                          {toStringValue(embed.title || embed.description, "Sin resumen")}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="icon" onClick={() => loadTemplate(template)} title="Cargar plantilla">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => void handleDeleteTemplate(templateId)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={<Layers3 className="h-6 w-6" />} title="Sin templates" description="Guarda tu primer embed reutilizable desde este constructor." />
          )}
        </SectionCard>
      </div>
    </PaneGrid>
  );
}
