"use client";

import { useEffect, useState } from "react";
import { Eye, FlaskConical, Layers, LayoutTemplate } from "lucide-react";
import {
  getTicketConfig,
  publishTickets,
  saveTicketConfig,
  updateTicketEmbed,
} from "@/lib/api/endpoints";
import { TicketsManagePanel } from "@/components/features/server/panes/TicketsManagePanel";
import { TicketFlowBuilder } from "@/components/features/server/panes/TicketFlowBuilder";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { useGuildRoles } from "@/lib/hooks/useGuildRoles";
import { useToast } from "@/components/providers/ToastProvider";
import { paneTabKey, usePersistedTab } from "@/lib/hooks/usePersistedTab";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Switch } from "@/components/ui/Switch";
import {
  ChannelSelect,
  ColorInput,
  Field,
  FormActions,
  Input,
  LockedOverlay,
  MultiRoleSelect,
  PremiumLock,
  SectionCard,
  Textarea,
} from "@/components/features/shared";
import { DiscordEmbedShell } from "@/components/features/embed/EmbedPreview";
import { usePanel } from "@/components/providers/PanelProvider";
import { applyTicketPreset, TICKET_PRESETS } from "@/lib/ticket-presets";
import {
  createDefaultTicketFlow,
  normalizeTicketFlow,
  type TicketFlowGraph,
} from "@/lib/ticket-flow";
import { asArray, asRecord, getErrorMessage, toBooleanValue, toStringValue } from "@/lib/utils";

const TICKET_TABS = [
  { id: "panel", label: "Panel" },
  { id: "flow", label: "Flujo" },
  { id: "templates", label: "Plantillas" },
  { id: "roles", label: "Roles" },
  { id: "preview", label: "Preview" },
  { id: "categories", label: "Títulos" },
  { id: "labs", label: "Labs" },
  { id: "manage", label: "Gestión" },
  { id: "guide", label: "Guía" },
];
const TICKET_TAB_IDS = TICKET_TABS.map((item) => item.id);

type TicketOption = {
  value: string;
  label: string;
  description: string;
  /** Casos dentro de esta categoría de título. */
  problems?: TicketOption[];
};

type TicketConfigState = {
  enabled: boolean;
  panelChannelId: string;
  requestChannelId: string;
  receiptHistoryChannelId: string;
  sendDmReceipt: boolean;
  sendDmPendingStatus: boolean;
  title: string;
  message: string;
  buttonLabel: string;
  color: string;
  footer: string;
  adminRoleIds: string[];
  ticketCategories: TicketOption[];
  commonProblems: TicketOption[];
  supportAreas: TicketOption[];
  /** @deprecated Usar supportAreas */
  minecraftServers?: TicketOption[];
  caseRoleMap: Record<string, string[]>;
  customFlow: TicketFlowGraph;
};

function normalizeRoleIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((id) => toStringValue(id)).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function normalizeCaseRoleMap(value: unknown): Record<string, string[]> {
  const map = asRecord(value);
  const result: Record<string, string[]> = {};
  for (const [key, roles] of Object.entries(map)) {
    result[key] = normalizeRoleIds(roles);
  }
  return result;
}

function normalizeOptions(value: unknown): TicketOption[] {
  return asArray(value).map((entry, index) => {
    const item = asRecord(entry);
    return {
      value: toStringValue(item.value, `option-${index + 1}`),
      label: toStringValue(item.label || item.name, `Opción ${index + 1}`),
      description: toStringValue(item.description),
    };
  });
}

function normalizeTitleCategories(value: unknown): TicketOption[] {
  return asArray(value).map((entry, index) => {
    const item = asRecord(entry);
    return {
      value: toStringValue(item.value, `cat-${index + 1}`),
      label: toStringValue(item.label || item.name, `Categoría ${index + 1}`),
      description: toStringValue(item.description),
      problems: normalizeOptions(item.problems ?? item.items),
    };
  });
}

function slugFromTitle(title: string, fallback: string) {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function OptionEditor({
  title,
  options,
  onChange,
  primaryLabel = "Etiqueta",
  autoValueFromTitle = false,
  compact = false,
}: {
  title: string;
  options: TicketOption[];
  onChange: (next: TicketOption[]) => void;
  primaryLabel?: string;
  /** Si el valor está vacío, se genera desde el título al escribir. */
  autoValueFromTitle?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className={`font-medium text-white ${compact ? "text-xs text-zinc-300" : "text-sm"}`}>{title}</h4>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            onChange([...options, { value: "", label: "", description: "" }])
          }
        >
          Añadir
        </Button>
      </div>
      {options.map((option, index) => (
        <div
          key={`${title}-${index}`}
          className={`space-y-3 rounded-2xl border border-white/8 p-4 ${compact ? "bg-black/30" : "bg-black/20"}`}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={primaryLabel}>
              <Input
                value={option.label}
                onChange={(event) => {
                  const label = event.target.value;
                  const next = [...options];
                  const prev = next[index];
                  const shouldSyncValue =
                    autoValueFromTitle &&
                    (!prev.value || prev.value === slugFromTitle(prev.label, ""));
                  next[index] = {
                    ...prev,
                    label,
                    ...(shouldSyncValue
                      ? { value: slugFromTitle(label, `option-${index + 1}`) }
                      : {}),
                  };
                  onChange(next);
                }}
              />
            </Field>
            <Field label="Valor">
              <Input
                value={option.value}
                onChange={(event) => {
                  const next = [...options];
                  next[index] = { ...next[index], value: event.target.value };
                  onChange(next);
                }}
              />
            </Field>
          </div>
          <Field label="Descripción">
            <Input
              value={option.description}
              onChange={(event) => {
                const next = [...options];
                next[index] = { ...next[index], description: event.target.value };
                onChange(next);
              }}
            />
          </Field>
          <Button
            size="sm"
            variant="danger"
            onClick={() => onChange(options.filter((_, i) => i !== index))}
          >
            Eliminar
          </Button>
        </div>
      ))}
      {!options.length ? (
        <p className="text-xs text-zinc-500">Sin ítems. Pulsa Añadir para crear el primero.</p>
      ) : null}
    </div>
  );
}

function TitleCategoryEditor({
  categories,
  onChange,
}: {
  categories: TicketOption[];
  onChange: (next: TicketOption[]) => void;
}) {
  function updateCategory(index: number, patch: Partial<TicketOption>) {
    const next = [...categories];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            onChange([
              ...categories,
              { value: "", label: "", description: "", problems: [] },
            ])
          }
        >
          Añadir categoría
        </Button>
      </div>
      {categories.map((category, index) => (
        <div
          key={`title-cat-${index}`}
          className="space-y-4 rounded-2xl border border-violet-500/25 bg-violet-500/5 p-4"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Título">
              <Input
                value={category.label}
                onChange={(event) => {
                  const label = event.target.value;
                  const shouldSyncValue =
                    !category.value || category.value === slugFromTitle(category.label, "");
                  updateCategory(index, {
                    label,
                    ...(shouldSyncValue
                      ? { value: slugFromTitle(label, `cat-${index + 1}`) }
                      : {}),
                  });
                }}
              />
            </Field>
            <Field label="Valor">
              <Input
                value={category.value}
                onChange={(event) => updateCategory(index, { value: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Descripción">
            <Input
              value={category.description}
              onChange={(event) => updateCategory(index, { description: event.target.value })}
            />
          </Field>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <OptionEditor
              title={`Casos dentro de «${category.label || "sin título"}»`}
              primaryLabel="Título del caso"
              autoValueFromTitle
              compact
              options={category.problems || []}
              onChange={(problems) => updateCategory(index, { problems })}
            />
          </div>
          <Button
            size="sm"
            variant="danger"
            onClick={() => onChange(categories.filter((_, i) => i !== index))}
          >
            Eliminar categoría
          </Button>
        </div>
      ))}
      {!categories.length ? (
        <p className="text-sm text-zinc-500">
          Aún no hay categorías de título. Añade una y crea los casos dentro.
        </p>
      ) : null}
    </div>
  );
}

export function TicketsPane({ guildId }: { guildId: string }) {
  const { toast } = useToast();
  const { premiumLocked } = usePanel();
  const { channels } = useGuildChannels(guildId);
  const { roles } = useGuildRoles(guildId);
  const [tab, setTab] = usePersistedTab(paneTabKey(guildId, "tickets"), "manage", TICKET_TAB_IDS);
  const [config, setConfig] = useState<TicketConfigState>({
    enabled: false,
    panelChannelId: "",
    requestChannelId: "",
    receiptHistoryChannelId: "",
    sendDmReceipt: true,
    sendDmPendingStatus: false,
    title: "Soporte",
    message: "",
    buttonLabel: "Solicitar ticket",
    color: "7c4dff",
    footer: "Sistema de Tickets",
    adminRoleIds: [],
    ticketCategories: [],
    commonProblems: [],
    supportAreas: [],
    caseRoleMap: {},
    customFlow: createDefaultTicketFlow(),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [updatingEmbed, setUpdatingEmbed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void getTicketConfig(guildId)
      .catch(() => ({}))
      .then((configData) => {
        if (!mounted) return;
        const cfg = asRecord(configData);
        setConfig({
          enabled: toBooleanValue(cfg.enabled),
          panelChannelId: toStringValue(cfg.panelChannelId || cfg.channelId),
          requestChannelId: toStringValue(cfg.requestChannelId),
          receiptHistoryChannelId: toStringValue(cfg.receiptHistoryChannelId),
          sendDmReceipt: toBooleanValue(cfg.sendDmReceipt, true),
          sendDmPendingStatus: toBooleanValue(cfg.sendDmPendingStatus),
          title: toStringValue(cfg.title, "Soporte"),
          message: toStringValue(cfg.message),
          buttonLabel: toStringValue(cfg.buttonLabel, "Solicitar ticket"),
          color: toStringValue(cfg.color, "7c4dff").replace("#", ""),
          footer: toStringValue(cfg.footer, "Sistema de Tickets"),
          adminRoleIds: normalizeRoleIds(cfg.adminRoleIds),
          ticketCategories: normalizeTitleCategories(cfg.ticketCategories),
          commonProblems: normalizeOptions(cfg.commonProblems),
          supportAreas: normalizeOptions(cfg.supportAreas ?? cfg.minecraftServers),
          caseRoleMap: normalizeCaseRoleMap(cfg.caseRoleMap),
          customFlow: normalizeTicketFlow(cfg.customFlow),
        });
      })
      .catch((err) => {
        if (mounted) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [guildId]);

  function buildPayload() {
    return {
      ...config,
      adminRoleIds: config.adminRoleIds,
      caseRoleMap: config.caseRoleMap,
      // Áreas Eyed.bio y casos globales retirados del panel.
      supportAreas: [],
      minecraftServers: [],
      commonProblems: [],
    };
  }

  const caseEntries = [
    ...config.ticketCategories.map((item) => ({
      key: item.value || item.label,
      label: `Título · ${item.label || item.value}`,
    })),
    ...config.ticketCategories.flatMap((cat) =>
      (cat.problems || []).map((item) => ({
        key: item.value || item.label,
        label: `${cat.label || cat.value} → ${item.label || item.value}`,
      }))
    ),
    ...config.commonProblems.map((item) => ({
      key: item.value || item.label,
      label: `Global · ${item.label || item.value}`,
    })),
    ...Object.keys(config.caseRoleMap)
      .filter((key) => !config.ticketCategories.some((item) => (item.value || item.label) === key))
      .filter(
        (key) =>
          !config.ticketCategories.some((cat) =>
            (cat.problems || []).some((item) => (item.value || item.label) === key)
          )
      )
      .filter((key) => !config.commonProblems.some((item) => (item.value || item.label) === key))
      .map((key) => ({ key, label: key })),
  ].filter((entry) => entry.key);

  async function handleSaveConfig() {
    setSaving(true);
    try {
      await saveTicketConfig(guildId, buildPayload());
      toast({ title: "Tickets guardados", description: "La configuración del panel quedó actualizada.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      await publishTickets(guildId, buildPayload());
      toast({ title: "Panel publicado", description: "El mensaje de tickets se envió al canal.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo publicar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setPublishing(false);
    }
  }

  async function handleUpdateEmbed() {
    setUpdatingEmbed(true);
    try {
      await updateTicketEmbed(guildId, buildPayload());
      toast({ title: "Embed actualizado", description: "El panel en Discord fue refrescado.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo actualizar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setUpdatingEmbed(false);
    }
  }

  if (error) return <Alert title="No se pudo cargar tickets" description={error} variant="danger" />;

  const previewColor = `#${config.color.replace("#", "").slice(0, 6) || "7c4dff"}`;

  return (
    <div className="relative space-y-5">
      <LockedOverlay
        visible={premiumLocked}
        title="Tickets premium"
        description="Configura y gestiona tickets con EyedPlus+."
      />

      <SectionCard
        title="Gestión de tickets"
        description="Equivalente al panel legacy con panel, categorías, preview y operación."
        action={<PremiumLock locked={premiumLocked} />}
      >
        <Tabs items={TICKET_TABS} value={tab} onValueChange={setTab} className="mb-6" />

        <div className={premiumLocked ? "pointer-events-none opacity-50" : ""}>
          {tab === "panel" ? (
            loading ? (
              <Alert title="Cargando panel" description="Consultando configuración de tickets." />
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div>
                    <p className="font-medium text-white">Sistema de tickets</p>
                    <p className="text-sm text-zinc-400">Habilita el panel de solicitudes.</p>
                  </div>
                  <Switch checked={config.enabled} onCheckedChange={(checked) => setConfig((c) => ({ ...c, enabled: checked }))} />
                </div>
                <Field label="Canal del panel">
                  <ChannelSelect
                    value={config.panelChannelId}
                    onChange={(panelChannelId) => setConfig((c) => ({ ...c, panelChannelId }))}
                    options={channels}
                  />
                </Field>
                <Field label="Canal de solicitudes">
                  <ChannelSelect
                    value={config.requestChannelId}
                    onChange={(requestChannelId) => setConfig((c) => ({ ...c, requestChannelId }))}
                    options={channels}
                  />
                </Field>
                <Field label="Título del embed">
                  <Input value={config.title} onChange={(event) => setConfig((c) => ({ ...c, title: event.target.value }))} />
                </Field>
                <Field label="Mensaje">
                  <Textarea value={config.message} onChange={(event) => setConfig((c) => ({ ...c, message: event.target.value }))} />
                </Field>
                <Field label="Texto del botón">
                  <Input
                    value={config.buttonLabel}
                    onChange={(event) => setConfig((c) => ({ ...c, buttonLabel: event.target.value }))}
                  />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Color embed">
                    <ColorInput value={config.color} onChange={(color) => setConfig((c) => ({ ...c, color }))} />
                  </Field>
                  <Field label="Footer">
                    <Input value={config.footer} onChange={(event) => setConfig((c) => ({ ...c, footer: event.target.value }))} />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-3">
                  <FormActions onSave={handleSaveConfig} saving={saving} />
                  <Button variant="secondary" onClick={() => void handlePublish()} disabled={publishing}>
                    {publishing ? "Publicando..." : "Publicar panel"}
                  </Button>
                  <Button variant="secondary" onClick={() => void handleUpdateEmbed()} disabled={updatingEmbed}>
                    {updatingEmbed ? "Actualizando..." : "Actualizar embed"}
                  </Button>
                </div>
              </div>
            )
          ) : null}

          {tab === "flow" ? (
            loading ? (
              <Alert title="Cargando flujo" description="Consultando grafo de tickets." />
            ) : (
              <div className="space-y-5">
                <TicketFlowBuilder
                  value={config.customFlow}
                  onChange={(customFlow) => setConfig((c) => ({ ...c, customFlow }))}
                />
                <FormActions onSave={handleSaveConfig} saving={saving} />
              </div>
            )
          ) : null}

          {tab === "templates" ? (
            <div className="space-y-5">
              <Alert
                title="Plantillas (vista owner)"
                description="Elige un tema listo: título del panel, mensaje, color y categorías de título con casos dentro. Los canales y roles no se modifican."
              />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {TICKET_PRESETS.map((preset) => {
                  const active = selectedTemplateId === preset.id;
                  const nestedCases = preset.ticketCategories.reduce(
                    (sum, cat) => sum + (cat.problems?.length || 0),
                    0
                  );
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setSelectedTemplateId(preset.id);
                        setConfig((current) => applyTicketPreset(preset, current));
                        toast({
                          title: "Plantilla aplicada",
                          description: `"${preset.name}" rellenó categorías de título y los casos de dentro. Guarda y publica cuando estés listo.`,
                          tone: "success",
                        });
                      }}
                      className={`rounded-2xl border p-4 text-left transition hover:border-violet-500/40 ${
                        active ? "border-violet-400/60 bg-violet-500/10" : "border-white/10 bg-black/20"
                      }`}
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: `#${preset.color.replace("#", "")}` }}
                          aria-hidden
                        />
                        <p className="font-medium text-white">{preset.name}</p>
                      </div>
                      <p className="text-sm text-zinc-400">{preset.description}</p>
                      <p className="mt-3 text-xs text-zinc-500">
                        {preset.ticketCategories.length} títulos · {nestedCases} casos dentro
                      </p>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3">
                <FormActions onSave={handleSaveConfig} saving={saving} />
                <Button variant="secondary" onClick={() => void handlePublish()} disabled={publishing}>
                  {publishing ? "Publicando..." : "Publicar panel"}
                </Button>
              </div>
            </div>
          ) : null}

          {tab === "roles" ? (
            <div className="space-y-5">
              <Field label="Roles de staff" description="Selecciona los roles que pueden gestionar tickets.">
                <MultiRoleSelect
                  value={config.adminRoleIds}
                  onChange={(adminRoleIds) => setConfig((c) => ({ ...c, adminRoleIds }))}
                  options={roles}
                />
              </Field>
              <FormActions onSave={handleSaveConfig} saving={saving} />
            </div>
          ) : null}

          {tab === "preview" ? (
            <div className="grid gap-5 xl:grid-cols-2">
              <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
                <div className="mb-4 flex items-center gap-2 text-sm text-zinc-400">
                  <Eye className="h-4 w-4" />
                  Vista previa del embed
                </div>
                <DiscordEmbedShell color={previewColor}>
                  <div className="p-4">
                    <p className="font-semibold text-white">{config.title || "Soporte"}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-[#dcddde]">
                      {config.message || "Presiona el botón para abrir un ticket."}
                    </p>
                    <p className="mt-4 text-xs text-[#949ba4]">{config.footer || "Sistema de Tickets"}</p>
                    <div className="mt-4">
                      <span className="inline-flex rounded-lg bg-[#5865f2] px-4 py-2 text-sm font-medium text-white">
                        {config.buttonLabel || "Solicitar ticket"}
                      </span>
                    </div>
                  </div>
                </DiscordEmbedShell>
              </div>
              <Alert
                title="Publicación"
                description="Guarda los cambios y usa Publicar panel para enviar este embed al canal configurado."
              />
            </div>
          ) : null}

          {tab === "categories" ? (
            <div className="space-y-8">
              <TitleCategoryEditor
                categories={config.ticketCategories}
                onChange={(ticketCategories) => setConfig((c) => ({ ...c, ticketCategories }))}
              />
              <FormActions onSave={handleSaveConfig} saving={saving} />
            </div>
          ) : null}

          {tab === "labs" ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                <div>
                  <p className="font-medium text-white">Recibo por DM</p>
                  <p className="text-sm text-zinc-400">Envía confirmación privada al abrir ticket.</p>
                </div>
                <Switch
                  checked={config.sendDmReceipt}
                  onCheckedChange={(checked) => setConfig((c) => ({ ...c, sendDmReceipt: checked }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                <div>
                  <p className="font-medium text-white">Estado pendiente por DM</p>
                  <p className="text-sm text-zinc-400">Notifica al usuario mientras espera aceptación.</p>
                </div>
                <Switch
                  checked={config.sendDmPendingStatus}
                  onCheckedChange={(checked) => setConfig((c) => ({ ...c, sendDmPendingStatus: checked }))}
                />
              </div>
              <Field label="Canal historial de recibos">
                <ChannelSelect
                  value={config.receiptHistoryChannelId}
                  onChange={(receiptHistoryChannelId) => setConfig((c) => ({ ...c, receiptHistoryChannelId }))}
                  options={channels}
                />
              </Field>
              <div className="space-y-4">
                <p className="text-sm text-zinc-400">
                  Asigna roles de staff por categoría o caso. Las claves coinciden con el valor de cada opción del panel.
                </p>
                {caseEntries.length ? (
                  caseEntries.map((entry) => (
                    <Field key={entry.key} label={entry.label}>
                      <MultiRoleSelect
                        value={config.caseRoleMap[entry.key] || []}
                        onChange={(roleIds) =>
                          setConfig((c) => ({
                            ...c,
                            caseRoleMap: { ...c.caseRoleMap, [entry.key]: roleIds },
                          }))
                        }
                        options={roles}
                      />
                    </Field>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">Añade categorías en la pestaña Categorías para mapear roles por caso.</p>
                )}
              </div>
              <FormActions onSave={handleSaveConfig} saving={saving} />
            </div>
          ) : null}

          {tab === "manage" ? <TicketsManagePanel guildId={guildId} /> : null}

          {tab === "guide" ? (
            <div className="space-y-4">
              <Alert
                title="Flujo recomendado"
                description="1) Configura el panel. 2) En Flujo arma el recorrido con nodos y líneas (activa «Usar este flujo»). 3) Roles de staff. 4) Preview y publica. 5) Gestiona pendientes."
              />
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-zinc-400">
                <div className="mb-2 flex items-center gap-2 font-medium text-zinc-200">
                  <LayoutTemplate className="h-4 w-4" />
                  Plantillas disponibles
                </div>
                {TICKET_PRESETS.map((preset) => preset.name).join(" · ")}
              </div>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <div className="rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-zinc-400">
        <div className="mb-2 flex items-center gap-2 font-medium text-zinc-200">
          <Layers className="h-4 w-4" />
          Activas
        </div>
        {config.ticketCategories.length
          ? config.ticketCategories
              .map((cat) => {
                const n = cat.problems?.length || 0;
                return `${cat.label || cat.value}${n ? ` (${n})` : ""}`;
              })
              .join(" · ")
          : "Sin categorías cargadas."}
        <div className="mt-3 flex items-center gap-2">
          <FlaskConical className="h-4 w-4" />
          Labs: DM recibo {config.sendDmReceipt ? "on" : "off"} · pendiente DM{" "}
          {config.sendDmPendingStatus ? "on" : "off"}
        </div>
      </div>
    </div>
  );
}
