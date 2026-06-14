"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Gift, RefreshCw, Store } from "lucide-react";
import {
  getFreeGamesConfig,
  previewFreeGames,
  refreshFreeGamesEmbeds,
  saveFreeGamesConfig,
  testFreeGames,
} from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { useGuildRoles } from "@/lib/hooks/useGuildRoles";
import { usePanel } from "@/components/providers/PanelProvider";
import { useToast } from "@/components/providers/ToastProvider";
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
  PaneGrid,
  PremiumLock,
  RoleSelect,
  SectionCard,
} from "@/components/features/shared";
import { asArray, asRecord, formatDate, getErrorMessage, toBooleanValue, toNumberValue, toStringValue } from "@/lib/utils";

const FREE_GAMES_TABS = [
  { id: "config", label: "Configuración" },
  { id: "offers", label: "Ofertas" },
  { id: "preview", label: "Vista previa" },
];

type FreeGamesState = {
  enabled: boolean;
  channelId: string;
  mentionText: string;
  sources: { epic: boolean; steam: boolean };
  color: string;
  footerText: string;
  minDiscount: number;
  notifiedCount: number;
  trackedEmbeds: number;
};

type FreeGameItem = {
  id: string;
  title: string;
  description: string;
  sourceLabel: string;
  source: string;
  imageUrl: string;
  originalPrice: string;
  discountPercent: number;
  endsAt: string;
  storeUrl: string;
  publisher: string;
  tags: string[];
};

function normalizeConfig(value: unknown): FreeGamesState {
  const data = asRecord(value);
  const sources = asRecord(data.sources);
  return {
    enabled: toBooleanValue(data.enabled),
    channelId: toStringValue(data.channelId),
    mentionText: toStringValue(data.mentionText),
    sources: {
      epic: sources.epic !== false,
      steam: sources.steam !== false,
    },
    color: toStringValue(data.color, "4ccb81").replace("#", ""),
    footerText: toStringValue(data.footerText, "EyedBot · Juegos gratis"),
    minDiscount: toNumberValue(data.minDiscount, 100),
    notifiedCount: asArray(data.notifiedIds).length,
    trackedEmbeds: asArray(data.embedMessages).length,
  };
}

function parseGames(payload: unknown): FreeGameItem[] {
  const root = asRecord(payload);
  return asArray(root.games).map((entry, index) => {
    const game = asRecord(entry);
    return {
      id: toStringValue(game.id, `game-${index}`),
      title: toStringValue(game.title, "Juego"),
      description: toStringValue(game.description),
      sourceLabel: toStringValue(game.sourceLabel, toStringValue(game.source, "Tienda")),
      source: toStringValue(game.source),
      imageUrl: toStringValue(game.imageUrl),
      originalPrice: toStringValue(game.originalPrice),
      discountPercent: toNumberValue(game.discountPercent, 100),
      endsAt: toStringValue(game.endsAt),
      storeUrl: toStringValue(game.storeUrl),
      publisher: toStringValue(game.publisher),
      tags: asArray(game.tags).map((tag) => toStringValue(tag)).filter(Boolean),
    };
  });
}

function FreeGameEmbedPreview({ game, color }: { game: FreeGameItem; color: string }) {
  const hex = color.startsWith("#") ? color : `#${color.replace("#", "")}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#2f3136]">
      <div className="h-1" style={{ backgroundColor: hex }} />
      <div className="p-4">
        <p className="text-xs text-[#949ba4]">{game.sourceLabel}</p>
        <p className="mt-1 text-base font-semibold text-white">🎮 {game.title}</p>
        {game.description ? (
          <p className="mt-2 line-clamp-3 text-sm text-[#dcddde]">{game.description}</p>
        ) : null}
        {game.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={game.imageUrl} alt="" className="mt-3 max-h-40 w-full rounded-lg object-cover" />
        ) : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-[#1e1f22] px-3 py-2 text-xs text-[#dcddde]">
            <span className="text-[#949ba4]">Precio</span>
            <p className="mt-1">{game.originalPrice ? `~~${game.originalPrice}~~ → GRATIS` : "GRATIS"}</p>
          </div>
          <div className="rounded-lg bg-[#1e1f22] px-3 py-2 text-xs text-[#dcddde]">
            <span className="text-[#949ba4]">Descuento</span>
            <p className="mt-1">{game.discountPercent}%</p>
          </div>
          <div className="rounded-lg bg-[#1e1f22] px-3 py-2 text-xs text-[#dcddde]">
            <span className="text-[#949ba4]">Fin</span>
            <p className="mt-1">{game.endsAt ? formatDate(game.endsAt) : "—"}</p>
          </div>
        </div>
        {game.storeUrl ? (
          <a
            href={game.storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-sm text-violet-300 hover:text-violet-200"
          >
            Ver en tienda <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function FreeGamesPane({ guildId }: { guildId: string }) {
  const { premiumLocked } = usePanel();
  const { channels } = useGuildChannels(guildId);
  const { roles } = useGuildRoles(guildId);
  const { toast } = useToast();
  const [tab, setTab] = useState("config");
  const [form, setForm] = useState<FreeGamesState>({
    enabled: false,
    channelId: "",
    mentionText: "",
    sources: { epic: true, steam: true },
    color: "4ccb81",
    footerText: "EyedBot · Juegos gratis",
    minDiscount: 100,
    notifiedCount: 0,
    trackedEmbeds: 0,
  });
  const [games, setGames] = useState<FreeGameItem[]>([]);
  const [previewMeta, setPreviewMeta] = useState({ count: 0, fetchedAt: "" });
  const [loading, setLoading] = useState(true);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchOffers(force = false) {
    setLoadingOffers(true);
    try {
      const previewData = await previewFreeGames(guildId, {
        epic: form.sources.epic,
        steam: form.sources.steam,
        force,
      });
      const root = asRecord(previewData);
      const parsed = parseGames(previewData);
      setGames(parsed);
      setPreviewMeta({
        count: toNumberValue(root.count, parsed.length),
        fetchedAt: toStringValue(root.fetchedAt),
      });
    } catch (err) {
      toast({ title: "Error al cargar ofertas", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setLoadingOffers(false);
    }
  }

  useEffect(() => {
    let active = true;
    void getFreeGamesConfig(guildId)
      .then((configData) => {
        if (!active) return;
        setForm(normalizeConfig(configData));
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

  useEffect(() => {
    if (tab === "offers" || tab === "preview") void fetchOffers(false);
  }, [tab, guildId, form.sources.epic, form.sources.steam]);

  function buildPayload() {
    return {
      enabled: form.enabled,
      channelId: form.channelId,
      mentionText: form.mentionText,
      sources: form.sources,
      color: form.color,
      footerText: form.footerText,
      minDiscount: form.minDiscount,
    };
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await saveFreeGamesConfig(guildId, buildPayload());
      const saved = asRecord(asRecord(result).config || result);
      setForm(normalizeConfig(saved));
      toast({ title: "Juegos gratis guardados", description: "La automatización fue actualizada.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      await testFreeGames(guildId, buildPayload());
      toast({ title: "Prueba enviada", description: "Se publicó una muestra en el canal configurado.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo probar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setTesting(false);
    }
  }

  async function handleRefreshEmbeds() {
    setRefreshing(true);
    try {
      const result = await refreshFreeGamesEmbeds(guildId, buildPayload());
      const payload = asRecord(result);
      toast({
        title: "Embeds actualizados",
        description: `Actualizados: ${toNumberValue(payload.updated, 0)} · Sin coincidencia: ${toNumberValue(payload.notMatched, 0)}`,
        tone: "success",
      });
      if (payload.config) setForm(normalizeConfig(payload.config));
    } catch (err) {
      toast({ title: "No se pudieron actualizar embeds", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) return <Alert title="Cargando juegos gratis" description="Sincronizando configuración." />;
  if (error) return <Alert title="No se pudo cargar free games" description={error} variant="danger" />;

  const previewGame = games[0];

  return (
    <div className="relative">
      <LockedOverlay
        visible={premiumLocked}
        title="Juegos gratis premium"
        description="El feed de ofertas gratuitas está reservado para comunidades con EyedPlus+."
      />
      <PaneGrid>
        <SectionCard
          title="Feed de juegos gratis"
          description="Publica ofertas de Epic Games y Steam automáticamente en tu canal."
          action={<PremiumLock locked={premiumLocked} />}
        >
          <div className={premiumLocked ? "pointer-events-none opacity-50" : ""}>
            <Tabs items={FREE_GAMES_TABS} value={tab} onValueChange={setTab} className="mb-5" />

            {tab === "config" ? (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                    <p className="text-xs text-zinc-500">Ofertas notificadas</p>
                    <p className="text-xl font-semibold text-white">{form.notifiedCount}</p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                    <p className="text-xs text-zinc-500">Embeds rastreados</p>
                    <p className="text-xl font-semibold text-white">{form.trackedEmbeds}</p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                    <p className="text-xs text-zinc-500">Descuento mínimo</p>
                    <p className="text-xl font-semibold text-white">{form.minDiscount}%</p>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div>
                    <p className="font-medium text-white">Feed habilitado</p>
                    <p className="text-sm text-zinc-400">Detecta y anuncia juegos gratis en el canal elegido.</p>
                  </div>
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))}
                  />
                </div>

                <Field label="Canal de anuncios">
                  <ChannelSelect
                    value={form.channelId}
                    onChange={(channelId) => setForm((current) => ({ ...current, channelId }))}
                    options={channels}
                    filter="text"
                  />
                </Field>

                <Field label="Mención al publicar" description="@everyone, rol o texto libre.">
                  <Input
                    value={form.mentionText}
                    onChange={(event) => setForm((current) => ({ ...current, mentionText: event.target.value }))}
                    placeholder="@everyone o <@&rol>"
                  />
                </Field>
                <Field label="Mencionar rol">
                  <RoleSelect
                    value=""
                    onChange={(roleId) => {
                      if (!roleId) return;
                      setForm((current) => ({ ...current, mentionText: `<@&${roleId}>` }));
                    }}
                    options={roles}
                    placeholder="Elegir rol para mencionar"
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                    <div>
                      <p className="font-medium text-white">Epic Games</p>
                      <p className="text-sm text-zinc-400">Incluir ofertas de Epic.</p>
                    </div>
                    <Switch
                      checked={form.sources.epic}
                      onCheckedChange={(epic) =>
                        setForm((current) => ({ ...current, sources: { ...current.sources, epic } }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                    <div>
                      <p className="font-medium text-white">Steam</p>
                      <p className="text-sm text-zinc-400">Incluir ofertas de Steam.</p>
                    </div>
                    <Switch
                      checked={form.sources.steam}
                      onCheckedChange={(steam) =>
                        setForm((current) => ({ ...current, sources: { ...current.sources, steam } }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Color del embed">
                    <ColorInput value={form.color} onChange={(color) => setForm((current) => ({ ...current, color }))} />
                  </Field>
                  <Field label="Descuento mínimo (%)" description="Solo ofertas con al menos este descuento (100 = gratis).">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={form.minDiscount}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          minDiscount: Math.max(0, Math.min(100, Number(event.target.value) || 100)),
                        }))
                      }
                    />
                  </Field>
                </div>

                <Field label="Pie del embed">
                  <Input
                    value={form.footerText}
                    onChange={(event) => setForm((current) => ({ ...current, footerText: event.target.value }))}
                  />
                </Field>

                <div className="flex flex-wrap gap-3">
                  <FormActions onSave={handleSave} onTest={handleTest} saving={saving} testing={testing} />
                  <Button variant="secondary" onClick={() => void handleRefreshEmbeds()} disabled={refreshing}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Actualizando…" : "Actualizar embeds"}
                  </Button>
                </div>
              </div>
            ) : null}

            {tab === "offers" ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-zinc-400">
                    {previewMeta.count} ofertas
                    {previewMeta.fetchedAt ? ` · ${formatDate(previewMeta.fetchedAt)}` : ""}
                  </p>
                  <Button variant="secondary" size="sm" onClick={() => void fetchOffers(true)} disabled={loadingOffers}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${loadingOffers ? "animate-spin" : ""}`} />
                    Recargar
                  </Button>
                </div>
                {loadingOffers ? (
                  <Alert title="Cargando ofertas" description="Consultando Epic Games y Steam." />
                ) : games.length ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {games.map((game) => (
                      <div key={game.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                        <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
                          <Store className="h-3.5 w-3.5" />
                          {game.sourceLabel}
                        </div>
                        <p className="font-medium text-white">{game.title}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{game.description || "Sin descripción"}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-200">
                            -{game.discountPercent}%
                          </span>
                          {game.publisher ? (
                            <span className="rounded-full bg-white/5 px-2 py-0.5 text-zinc-400">{game.publisher}</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Alert title="Sin ofertas" description="No hay juegos gratis detectados con los filtros actuales." />
                )}
              </div>
            ) : null}

            {tab === "preview" ? (
              <div className="space-y-4">
                {previewGame ? (
                  <FreeGameEmbedPreview game={previewGame} color={form.color} />
                ) : (
                  <Alert title="Sin preview" description="Abre la pestaña Ofertas o recarga para ver un ejemplo." />
                )}
                <p className="text-sm text-zinc-500">
                  Pie: {form.footerText} · Color: #{form.color.replace("#", "")}
                </p>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Cómo funciona" description="Automatización de juegos gratis.">
          <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-100">
              <Gift className="h-6 w-6" />
            </div>
            <ul className="space-y-2 text-sm text-zinc-300">
              <li>· El bot revisa Epic Games y Steam periódicamente.</li>
              <li>· Publica embeds nuevos en el canal configurado.</li>
              <li>· «Actualizar embeds» refresca tiempos y precios en mensajes ya enviados.</li>
              <li>· «Probar» envía una muestra al canal sin esperar al scheduler.</li>
            </ul>
          </div>
        </SectionCard>
      </PaneGrid>
    </div>
  );
}
