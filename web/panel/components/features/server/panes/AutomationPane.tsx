"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FolderTree, Layers3, Play, RefreshCw, Wand2 } from "lucide-react";
import { applyChannelSetup, getChannelSetup } from "@/lib/api/endpoints";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/Badge";
import { Field, PaneGrid, SectionCard } from "@/components/features/shared";
import { asArray, asRecord, getErrorMessage, toBooleanValue, toStringValue } from "@/lib/utils";

const AUTOMATION_TABS = [
  { id: "templates", label: "Plantillas" },
  { id: "preview", label: "Vista previa" },
  { id: "apply", label: "Aplicar" },
  { id: "guide", label: "Guía" },
];

type ChannelPreviewRow = {
  categorySlug: string;
  categoryLabel: string;
  channelSlug: string;
  channelLabel: string;
  type: string;
  topic: string;
};

type TemplateSummary = {
  id: string;
  label: string;
  description: string;
  preview: ChannelPreviewRow[];
};

type TemplateConflict = {
  category: string;
  channel: string;
  type: string;
  reason: string;
};

type ApplyResult = {
  created: Array<Record<string, unknown>>;
  skipped: Array<Record<string, unknown>>;
  errors: Array<Record<string, unknown>>;
};

function parsePreviewRows(value: unknown): ChannelPreviewRow[] {
  return asArray(value).map((entry) => {
    const row = asRecord(entry);
    return {
      categorySlug: toStringValue(row.categorySlug),
      categoryLabel: toStringValue(row.categoryLabel, "Categoría"),
      channelSlug: toStringValue(row.channelSlug),
      channelLabel: toStringValue(row.channelLabel, "canal"),
      type: toStringValue(row.type, "text"),
      topic: toStringValue(row.topic),
    };
  });
}

function groupByCategory(rows: ChannelPreviewRow[]) {
  const groups = new Map<string, ChannelPreviewRow[]>();
  for (const row of rows) {
    const key = row.categoryLabel || row.categorySlug;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }
  return groups;
}

export function AutomationPane({ guildId }: { guildId: string }) {
  const { toast } = useToast();
  const [tab, setTab] = useState("templates");
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [conflictsByTemplate, setConflictsByTemplate] = useState<Record<string, TemplateConflict[]>>({});
  const [selectedTemplateId, setSelectedTemplateId] = useState("standard");
  const [skipExisting, setSkipExisting] = useState(true);
  const [lastResult, setLastResult] = useState<ApplyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSetup() {
    setLoading(true);
    setError(null);
    try {
      const setupData = await getChannelSetup(guildId);
      const root = asRecord(setupData);
      const parsedTemplates = asArray(root.templates).map((entry) => {
        const item = asRecord(entry);
        return {
          id: toStringValue(item.id),
          label: toStringValue(item.label, "Plantilla"),
          description: toStringValue(item.description),
          preview: parsePreviewRows(item.preview),
        };
      });
      setTemplates(parsedTemplates);

      const conflictsRoot = asRecord(root.conflictsByTemplate);
      const conflictsMap: Record<string, TemplateConflict[]> = {};
      for (const [templateId, payload] of Object.entries(conflictsRoot)) {
        const conflictData = asRecord(payload);
        conflictsMap[templateId] = asArray(conflictData.conflicts).map((entry) => {
          const row = asRecord(entry);
          return {
            category: toStringValue(row.category),
            channel: toStringValue(row.channel),
            type: toStringValue(row.type),
            reason: toStringValue(row.reason, "Ya existe"),
          };
        });
      }
      setConflictsByTemplate(conflictsMap);

      if (parsedTemplates.length && !parsedTemplates.some((item) => item.id === selectedTemplateId)) {
        setSelectedTemplateId(parsedTemplates[0].id);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSetup();
  }, [guildId]);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedTemplateId) || templates[0],
    [templates, selectedTemplateId]
  );

  const selectedConflicts = conflictsByTemplate[selectedTemplate?.id || ""] || [];
  const previewGroups = useMemo(
    () => groupByCategory(selectedTemplate?.preview || []),
    [selectedTemplate]
  );

  async function handleApply() {
    if (!selectedTemplate) return;
    setApplying(true);
    try {
      const result = await applyChannelSetup(guildId, {
        templateId: selectedTemplate.id,
        skipExisting,
      });
      const payload = asRecord(result);
      const parsed: ApplyResult = {
        created: asArray(payload.created).map((entry) => asRecord(entry)),
        skipped: asArray(payload.skipped).map((entry) => asRecord(entry)),
        errors: asArray(payload.errors).map((entry) => asRecord(entry)),
      };
      setLastResult(parsed);
      setTab("apply");
      toast({
        title: "Estructura aplicada",
        description: `Creados: ${parsed.created.length} · Omitidos: ${parsed.skipped.length} · Errores: ${parsed.errors.length}`,
        tone: parsed.errors.length ? "danger" : "success",
      });
      await loadSetup();
    } catch (err) {
      toast({ title: "No se pudo aplicar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setApplying(false);
    }
  }

  if (loading) return <Alert title="Cargando automatización" description="Consultando plantillas de canales del servidor." />;
  if (error) return <Alert title="No se pudo cargar automatización" description={error} variant="danger" />;

  return (
    <PaneGrid>
      <SectionCard
        title="Automatización de canales"
        description="Genera categorías y canales con plantillas listas. El bot omite duplicados si así lo indicas."
      >
        <Tabs items={AUTOMATION_TABS} value={tab} onValueChange={setTab} className="mb-6" />

        {tab === "templates" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-zinc-400">{templates.length} plantillas disponibles</p>
              <Button variant="secondary" size="sm" onClick={() => void loadSetup()} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Actualizar
              </Button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {templates.map((template) => {
                const active = template.id === selectedTemplate?.id;
                const conflicts = conflictsByTemplate[template.id]?.length || 0;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => {
                      setSelectedTemplateId(template.id);
                      setTab("preview");
                    }}
                    className={`rounded-2xl border p-5 text-left transition ${
                      active
                        ? "border-violet-500/50 bg-violet-500/10"
                        : "border-white/10 bg-black/20 hover:border-violet-500/30"
                    }`}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8 text-white">
                        <Layers3 className="h-5 w-5" />
                      </div>
                      {conflicts ? <Badge variant="default">{conflicts} existentes</Badge> : <Badge variant="success">Sin conflictos</Badge>}
                    </div>
                    <p className="font-medium text-white">{template.label}</p>
                    <p className="mt-2 text-sm text-zinc-400">{template.description}</p>
                    <p className="mt-3 text-xs text-zinc-500">{template.preview.length} canales en la plantilla</p>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {tab === "preview" && selectedTemplate ? (
          <div className="space-y-5">
            <Alert
              title={selectedTemplate.label}
              description={selectedTemplate.description}
            />
            {selectedConflicts.length ? (
              <Alert
                variant="danger"
                title={`${selectedConflicts.length} canales ya existen`}
                description="Con «Omitir existentes» activo, esos canales no se volverán a crear."
              />
            ) : null}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[...previewGroups.entries()].map(([category, rows]) => (
                <div key={category} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                    <FolderTree className="h-4 w-4 text-violet-300" />
                    {category}
                  </div>
                  <ul className="space-y-2">
                    {rows.map((row) => (
                      <li key={`${row.channelSlug}-${row.type}`} className="rounded-xl bg-white/5 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-zinc-200">#{row.channelLabel}</span>
                          <Badge variant={row.type === "voice" ? "premium" : "default"}>
                            {row.type === "voice" ? "Voz" : "Texto"}
                          </Badge>
                        </div>
                        {row.topic ? <p className="mt-1 text-xs text-zinc-500">{row.topic}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "apply" ? (
          <div className="space-y-5">
            <Field label="Plantilla seleccionada">
              <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                <p className="font-medium text-white">{selectedTemplate?.label || "Sin plantilla"}</p>
                <p className="mt-1 text-sm text-zinc-400">{selectedTemplate?.description}</p>
              </div>
            </Field>

            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
              <div>
                <p className="font-medium text-white">Omitir canales existentes</p>
                <p className="text-sm text-zinc-400">No recrea categorías o canales que ya tengan el mismo nombre.</p>
              </div>
              <Switch checked={skipExisting} onCheckedChange={setSkipExisting} />
            </div>

            <Button onClick={() => void handleApply()} disabled={applying || !selectedTemplate}>
              <Play className="mr-2 h-4 w-4" />
              {applying ? "Creando estructura…" : "Aplicar plantilla"}
            </Button>

            {lastResult ? (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Creados</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{lastResult.created.length}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Omitidos</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{lastResult.skipped.length}</p>
                </div>
                <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-red-200">Errores</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{lastResult.errors.length}</p>
                </div>
              </div>
            ) : null}

            {lastResult?.errors.length ? (
              <div className="space-y-2">
                {lastResult.errors.slice(0, 6).map((entry, index) => (
                  <div key={index} className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-100">
                    {toStringValue(entry.message || entry.name, "Error al crear canal")}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "guide" ? (
          <div className="space-y-4">
            <Alert
              title="Cómo funciona"
              description="Elige una plantilla, revisa la vista previa y aplica. El bot necesita permiso «Gestionar canales» y creará categorías con sus canales de texto y voz."
            />
            <ul className="space-y-2 text-sm text-zinc-400">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                Las plantillas usan nombres normalizados compatibles con Discord.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                Puedes ejecutar de nuevo la misma plantilla: solo se creará lo que falte.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                Anti-raid y filtros avanzados están en el módulo Seguridad.
              </li>
            </ul>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Resumen" description="Estado de la plantilla activa.">
        <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-100">
            <Wand2 className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-white">{selectedTemplate?.label || "Sin plantilla"}</p>
          <p className="mt-2 text-sm text-zinc-400">
            {selectedTemplate?.preview.length || 0} canales · {selectedConflicts.length} conflictos detectados
          </p>
          <p className="mt-4 text-xs text-zinc-500">
            Omitir existentes: {toBooleanValue(skipExisting) ? "Sí" : "No"}
          </p>
        </div>
      </SectionCard>
    </PaneGrid>
  );
}
