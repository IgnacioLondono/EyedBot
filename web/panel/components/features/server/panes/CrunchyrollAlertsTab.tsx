"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2, Tv } from "lucide-react";
import {
  getCrunchyrollConfig,
  previewCrunchyroll,
  saveCrunchyrollConfig,
  searchCrunchyrollSeries,
  testCrunchyrollAlert,
} from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { useGuildRoles } from "@/lib/hooks/useGuildRoles";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Switch } from "@/components/ui/Switch";
import {
  ChannelSelect,
  ColorInput,
  Field,
  FormActions,
  Input,
  RoleSelect,
  SectionCard,
  Textarea,
} from "@/components/features/shared";
import { DiscordEmbedPreview } from "@/components/features/embed/EmbedPreview";
import { plainColorToHex } from "@/lib/embed-utils";
import { asArray, asRecord, formatDate, getErrorMessage, toBooleanValue, toNumberValue, toStringValue } from "@/lib/utils";

type CrunchyrollSeries = {
  id: string;
  enabled: boolean;
  seriesId: string;
  title: string;
  url: string;
  imageUrl: string;
  lastEpisodeId: string;
  lastEpisodeNumber: number;
  lastPostedAt: string;
};

type CrunchyrollState = {
  enabled: boolean;
  channelId: string;
  mentionText: string;
  titleTemplate: string;
  descriptionTemplate: string;
  color: string;
  footerText: string;
  embedLargePreview: boolean;
  notifyAllAnime: boolean;
  series: CrunchyrollSeries[];
};

type SearchResult = {
  seriesId: string;
  title: string;
  description: string;
  imageUrl: string;
  url: string;
};

type UpcomingItem = {
  seriesTitle: string;
  title: string;
  episodeNumber: number;
  seasonNumber: number;
  url: string;
  publishedAt: string | null;
};

const defaultForm: CrunchyrollState = {
  enabled: false,
  channelId: "",
  mentionText: "",
  titleTemplate: "📺 {series} · Episodio {episode}",
  descriptionTemplate: "**{episodeTitle}**\n{url}",
  color: "f47521",
  footerText: "EyedBot · Crunchyroll",
  embedLargePreview: true,
  notifyAllAnime: true,
  series: [],
};

function normalizeSeries(entry: unknown, index: number): CrunchyrollSeries {
  const data = asRecord(entry);
  return {
    id: toStringValue(data.id, `cr_${index + 1}`),
    enabled: toBooleanValue(data.enabled, true),
    seriesId: toStringValue(data.seriesId),
    title: toStringValue(data.title, "Serie"),
    url: toStringValue(data.url),
    imageUrl: toStringValue(data.imageUrl),
    lastEpisodeId: toStringValue(data.lastEpisodeId),
    lastEpisodeNumber: toNumberValue(data.lastEpisodeNumber),
    lastPostedAt: toStringValue(data.lastPostedAt),
  };
}

function normalizeForm(value: unknown): CrunchyrollState {
  const data = asRecord(value);
  return {
    enabled: toBooleanValue(data.enabled),
    channelId: toStringValue(data.channelId),
    mentionText: toStringValue(data.mentionText),
    titleTemplate: toStringValue(data.titleTemplate, defaultForm.titleTemplate),
    descriptionTemplate: toStringValue(data.descriptionTemplate, defaultForm.descriptionTemplate),
    color: toStringValue(data.color, defaultForm.color).replace("#", ""),
    footerText: toStringValue(data.footerText, defaultForm.footerText),
    embedLargePreview: toBooleanValue(data.embedLargePreview, true),
    notifyAllAnime: data.notifyAllAnime !== false,
    series: asArray(data.series).map(normalizeSeries),
  };
}

function parseSearchResult(entry: unknown): SearchResult | null {
  const data = asRecord(entry);
  const seriesId = toStringValue(data.seriesId);
  if (!seriesId) return null;
  return {
    seriesId,
    title: toStringValue(data.title, "Serie"),
    description: toStringValue(data.description),
    imageUrl: toStringValue(data.imageUrl),
    url: toStringValue(data.url),
  };
}

export function CrunchyrollAlertsTab({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { roles } = useGuildRoles(guildId);
  const { toast } = useToast();
  const [form, setForm] = useState<CrunchyrollState>(defaultForm);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void Promise.all([getCrunchyrollConfig(guildId), previewCrunchyroll(guildId).catch(() => null)])
      .then(([config, preview]) => {
        setForm(normalizeForm(config));
        const previewData = asRecord(preview);
        setUpcoming(
          asArray(previewData.upcoming)
            .map((item) => {
              const row = asRecord(item);
              return {
                seriesTitle: toStringValue(row.seriesTitle, "Anime"),
                title: toStringValue(row.title, "Episodio"),
                episodeNumber: toNumberValue(row.episodeNumber),
                seasonNumber: toNumberValue(row.seasonNumber),
                url: toStringValue(row.url),
                publishedAt: toStringValue(row.publishedAt) || null,
              };
            })
            .slice(0, 8)
        );
      })
      .catch((err) => {
        toast({ title: "No se pudo cargar Crunchyroll", description: getErrorMessage(err), tone: "danger" });
      })
      .finally(() => setLoading(false));
  }, [guildId, toast]);

  const previewSeries = form.series.find((item) => item.enabled) || form.series[0];

  const previewTitle = form.titleTemplate
    .replace("{series}", previewSeries?.title || "Solo Leveling")
    .replace("{episode}", String(previewSeries?.lastEpisodeNumber || 12))
    .replace("{episodeTitle}", "El despertar del cazador")
    .replace("{season}", "2")
    .replace("{url}", previewSeries?.url || "https://www.crunchyroll.com");

  const previewDescription = form.descriptionTemplate
    .replace("{series}", previewSeries?.title || "Solo Leveling")
    .replace("{episode}", String(previewSeries?.lastEpisodeNumber || 12))
    .replace("{episodeTitle}", "El despertar del cazador")
    .replace("{season}", "2")
    .replace("{url}", previewSeries?.url || "https://www.crunchyroll.com");

  const trackedIds = useMemo(() => new Set(form.series.map((item) => item.seriesId)), [form.series]);

  async function handleSearch() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const payload = asRecord(await searchCrunchyrollSeries(guildId, q));
      setResults(asArray(payload.results).map(parseSearchResult).filter(Boolean) as SearchResult[]);
    } catch (err) {
      toast({ title: "Búsqueda fallida", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSearching(false);
    }
  }

  function addSeries(item: SearchResult) {
    if (trackedIds.has(item.seriesId)) return;
    setForm((current) => ({
      ...current,
      series: [
        ...current.series,
        {
          id: `cr_${Date.now()}`,
          enabled: true,
          seriesId: item.seriesId,
          title: item.title,
          url: item.url,
          imageUrl: item.imageUrl,
          lastEpisodeId: "",
          lastEpisodeNumber: 0,
          lastPostedAt: "",
        },
      ],
    }));
  }

  function updateSeries(index: number, patch: Partial<CrunchyrollSeries>) {
    setForm((current) => {
      const series = [...current.series];
      series[index] = { ...series[index], ...patch };
      return { ...current, series };
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveCrunchyrollConfig(guildId, form);
      toast({ title: "Crunchyroll guardado", description: "Las alertas de anime quedaron actualizadas.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      await testCrunchyrollAlert(guildId, form);
      toast({ title: "Prueba enviada", description: "Se publicó un aviso de ejemplo en el canal.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo probar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <EmptyState title="Cargando Crunchyroll" description="Consultando series y calendario simulcast." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-2xl border border-orange-400/20 bg-orange-500/10 px-4 py-3">
        <Tv className="h-5 w-5 text-orange-200" />
        <p className="text-sm text-orange-100">
          Publica en Discord cuando Crunchyroll añada episodios nuevos. Con <strong>Todos los estrenos</strong> no hace falta elegir series una por una.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
        <div>
          <p className="font-medium text-white">Alertas Crunchyroll</p>
          <p className="text-sm text-zinc-400">Revisa episodios nuevos cada ~20 minutos.</p>
        </div>
        <Switch checked={form.enabled} onCheckedChange={(checked) => setForm((c) => ({ ...c, enabled: checked }))} />
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
        <div>
          <p className="font-medium text-white">Todos los estrenos</p>
          <p className="text-sm text-zinc-400">
            Avisa por cada capítulo nuevo en el feed de Crunchyroll (cualquier anime). La primera revisión solo sincroniza; los avisos empiezan en el siguiente ciclo (~20 min).
          </p>
        </div>
        <Switch
          checked={form.notifyAllAnime}
          onCheckedChange={(checked) => setForm((c) => ({ ...c, notifyAllAnime: checked }))}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Canal de avisos">
          <ChannelSelect value={form.channelId} onChange={(channelId) => setForm((c) => ({ ...c, channelId }))} options={channels} />
        </Field>
        <Field label="Mención">
          <Input
            value={form.mentionText}
            onChange={(event) => setForm((c) => ({ ...c, mentionText: event.target.value }))}
            placeholder="@everyone o <@&rol>"
          />
        </Field>
      </div>

      <Field label="Mencionar rol">
        <RoleSelect
          value=""
          onChange={(roleId) => {
            if (!roleId) return;
            setForm((c) => ({ ...c, mentionText: `<@&${roleId}>` }));
          }}
          options={roles}
          placeholder="Elegir rol"
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Plantilla título" description="{series}, {episode}, {episodeTitle}">
          <Input value={form.titleTemplate} onChange={(event) => setForm((c) => ({ ...c, titleTemplate: event.target.value }))} />
        </Field>
        <Field label="Color">
          <ColorInput value={form.color} onChange={(color) => setForm((c) => ({ ...c, color }))} />
        </Field>
      </div>

      <Field label="Plantilla descripción" description="{url}, {season}">
        <Textarea
          value={form.descriptionTemplate}
          onChange={(event) => setForm((c) => ({ ...c, descriptionTemplate: event.target.value }))}
          rows={3}
        />
      </Field>

      <Field label="Footer">
        <Input value={form.footerText} onChange={(event) => setForm((c) => ({ ...c, footerText: event.target.value }))} />
      </Field>

      <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
        <div>
          <p className="font-medium text-white">Imagen grande</p>
          <p className="text-sm text-zinc-400">Usa la portada del episodio como banner del embed.</p>
        </div>
        <Switch
          checked={form.embedLargePreview}
          onCheckedChange={(checked) => setForm((c) => ({ ...c, embedLargePreview: checked }))}
        />
      </div>

      <SectionCard
        title="Seguir series (opcional)"
        description="Añade títulos concretos si quieres seguimiento extra además del feed global."
      >
        <div className="mb-4 flex gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ej. Solo Leveling o URL de la serie"
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleSearch();
            }}
          />
          <Button variant="accent" onClick={() => void handleSearch()} loading={searching}>
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {results.length ? (
          <div className="mb-5 space-y-2">
            {results.map((item) => (
              <div key={item.seriesId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 p-3">
                <div className="min-w-0">
                  <p className="font-medium text-white">{item.title}</p>
                  <p className="truncate text-xs text-zinc-500">{item.seriesId}</p>
                </div>
                <Button size="sm" variant="secondary" disabled={trackedIds.has(item.seriesId)} onClick={() => addSeries(item)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {trackedIds.has(item.seriesId) ? "Añadida" : "Seguir"}
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {form.series.length ? (
          <div className="space-y-3">
            {form.series.map((item, index) => (
              <div key={item.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{item.title}</p>
                    <p className="text-xs text-zinc-500">
                      {item.seriesId}
                      {item.lastEpisodeNumber ? ` · último ep. ${item.lastEpisodeNumber}` : ""}
                      {item.lastPostedAt ? ` · aviso ${formatDate(item.lastPostedAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={item.enabled} onCheckedChange={(checked) => updateSeries(index, { enabled: checked })} />
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setForm((c) => ({ ...c, series: c.series.filter((_, i) => i !== index) }))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title={form.notifyAllAnime ? "Feed global activo" : "Sin series"}
            description={
              form.notifyAllAnime
                ? "Recibirás avisos de cualquier estreno nuevo. Aquí puedes añadir series específicas si quieres."
                : "Activa «Todos los estrenos» o busca y añade anime para recibir avisos."
            }
          />
        )}
      </SectionCard>

      {upcoming.length ? (
        <SectionCard title="Próximos / recientes" description="Vista rápida del catálogo Crunchyroll.">
          <div className="space-y-2">
            {upcoming.map((item, index) => (
              <div key={`${item.url}-${index}`} className="rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm">
                <p className="font-medium text-white">
                  {item.seriesTitle} · Ep. {item.episodeNumber || "?"}
                </p>
                <p className="text-zinc-400">{item.title}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Vista previa del aviso">
        <DiscordEmbedPreview
          title={previewTitle}
          description={previewDescription}
          color={plainColorToHex(form.color)}
          footer={form.footerText}
          imageUrl={form.embedLargePreview ? previewSeries?.imageUrl : ""}
          thumbnailUrl={!form.embedLargePreview ? previewSeries?.imageUrl : ""}
        />
      </SectionCard>

      <FormActions onSave={() => void handleSave()} onTest={() => void handleTest()} saving={saving} testing={testing} />
    </div>
  );
}
