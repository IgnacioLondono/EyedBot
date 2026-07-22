"use client";

import { useEffect, useState } from "react";
import { Gem, Package, Search, ShoppingBag, Sparkles } from "lucide-react";
import {
  gachaCatalogImageUrl,
  getGachaConfig,
  getGachaInventory,
  getGachaLeaderboard,
  getGachaMarket,
  getGachaShop,
  getGachaStats,
  saveGachaConfig,
} from "@/lib/api/endpoints";
import {
  LeaderboardPodium,
  LeaderboardRow,
  type LeaderboardEntry,
} from "@/components/features/shared/LeaderboardPodium";
import { usePanel } from "@/components/providers/PanelProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { paneTabKey, usePersistedTab } from "@/lib/hooks/usePersistedTab";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";
import { Switch } from "@/components/ui/Switch";
import {
  Field,
  FormActions,
  Input,
  LockedOverlay,
  PaneGrid,
  PremiumLock,
  SectionCard,
  ChannelSelect,
} from "@/components/features/shared";
import { asArray, asRecord, extractLeaderboard, getErrorMessage, toBooleanValue, toNumberValue, toStringValue } from "@/lib/utils";
import { GachaShopPanel } from "@/components/features/server/panes/GachaShopPanel";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";

const GACHA_TABS = [
  { id: "config", label: "Config" },
  { id: "economy", label: "Economía" },
  { id: "shop", label: "Tienda" },
  { id: "market", label: "Mercado" },
  { id: "inventory", label: "Inventario" },
  { id: "top", label: "Ranking" },
];
const GACHA_TAB_IDS = GACHA_TABS.map((item) => item.id);

type GachaState = {
  enabled: boolean;
  channelId: string;
  rollCooldownSec: number;
  claimCooldownSec: number;
  economyEnabled: boolean;
  shopEnabled: boolean;
  coinsPerXp: number;
  coinsPerLevelUp: number;
};

type InventoryItem = Record<string, unknown>;

export function GachaPane({ guildId }: { guildId: string }) {
  const { bootstrap, premiumLocked } = usePanel();
  const { channels } = useGuildChannels(guildId);
  const { toast } = useToast();
  const [tab, setTab] = usePersistedTab(paneTabKey(guildId, "gacha"), "config", GACHA_TAB_IDS);
  const [form, setForm] = useState<GachaState>({
    enabled: false,
    channelId: "",
    rollCooldownSec: 60,
    claimCooldownSec: 30,
    economyEnabled: false,
    shopEnabled: true,
    coinsPerXp: 1,
    coinsPerLevelUp: 75,
  });
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [shop, setShop] = useState<Record<string, unknown>[]>([]);
  const [market, setMarket] = useState<Record<string, unknown>[]>([]);
  const [leaders, setLeaders] = useState<Record<string, unknown>[]>([]);
  const [inventoryUserId, setInventoryUserId] = useState("");
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryTotal, setInventoryTotal] = useState(0);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (bootstrap?.user?.id && !inventoryUserId) {
      setInventoryUserId(bootstrap.user.id);
    }
  }, [bootstrap?.user?.id, inventoryUserId]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getGachaConfig(guildId),
      getGachaStats(guildId),
      getGachaShop(guildId),
      getGachaMarket(guildId),
      getGachaLeaderboard(guildId),
    ])
      .then(([configData, statsData, shopData, marketData, leaderboardData]) => {
        if (!active) return;
        const config = asRecord(configData);
        const shopPayload = asRecord(shopData);
        setForm({
          enabled: toBooleanValue(config.enabled),
          channelId: toStringValue(config.channelId),
          rollCooldownSec: toNumberValue(config.rollCooldownSec, 60),
          claimCooldownSec: toNumberValue(config.claimCooldownSec, 30),
          economyEnabled: toBooleanValue(config.economyEnabled),
          shopEnabled: toBooleanValue(config.shopEnabled, true),
          coinsPerXp: toNumberValue(config.coinsPerXp, 1),
          coinsPerLevelUp: toNumberValue(config.coinsPerLevelUp, 75),
        });
        setStats(asRecord(statsData));
        setShop(asArray(shopPayload.items || shopData).map((entry) => asRecord(entry)));
        setMarket(asArray(asRecord(marketData).listings || marketData).map((entry) => asRecord(entry)));
        setLeaders(extractLeaderboard(leaderboardData).map((entry) => asRecord(entry)));
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

  async function loadInventory() {
    const userId = inventoryUserId.trim();
    if (!userId) {
      toast({ title: "Falta userId", description: "Indica el ID de Discord del usuario.", tone: "danger" });
      return;
    }

    setInventoryLoading(true);
    try {
      const payload = asRecord(await getGachaInventory(guildId, { userId, q: inventoryQuery.trim() || undefined }));
      setInventory(asArray(payload.items).map((entry) => asRecord(entry)));
      setInventoryTotal(toNumberValue(payload.total ?? payload.filteredTotal));
    } catch (err) {
      toast({ title: "No se pudo cargar inventario", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setInventoryLoading(false);
    }
  }

  async function reloadShop(options?: { includeRemoved?: boolean }) {
    const shopData = asRecord(await getGachaShop(guildId, options));
    setShop(asArray(shopData.items || shopData).map((entry) => asRecord(entry)));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveGachaConfig(guildId, form);
      toast({ title: "Gacha guardado", description: "La economía del banner quedó actualizada.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Alert title="Cargando gacha" description="Consultando banner, métricas y tienda." />;
  if (error) return <Alert title="No se pudo cargar gacha" description={error} variant="danger" />;

  return (
    <div className="relative">
      <LockedOverlay
        visible={premiumLocked}
        title="Gacha premium"
        description="El sistema gacha, tienda y estadísticas avanzadas requieren una suscripción activa."
      />
      <SectionCard
        title="Centro gacha"
        description="Administra banner, economía ligera y actividad del sistema."
        action={<PremiumLock locked={premiumLocked} />}
      >
        <Tabs
          items={GACHA_TABS}
          value={tab}
          onValueChange={setTab}
          className="mb-6"
        />

        {tab === "config" ? (
          <PaneGrid>
            <div className={premiumLocked ? "pointer-events-none opacity-50" : ""}>
              <div className="space-y-5">
                <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div>
                    <p className="font-medium text-white">Activar banner</p>
                    <p className="text-sm text-zinc-400">Permite tiradas diarias y recompensas.</p>
                  </div>
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))}
                  />
                </div>
                <Field label="Canal del gacha">
                  <ChannelSelect
                    value={form.channelId}
                    onChange={(channelId) => setForm((current) => ({ ...current, channelId }))}
                    options={channels}
                  />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Cooldown tirada (seg)">
                    <Input
                      type="number"
                      value={form.rollCooldownSec}
                      onChange={(event) => setForm((current) => ({ ...current, rollCooldownSec: Number(event.target.value) }))}
                    />
                  </Field>
                  <Field label="Cooldown claim (seg)">
                    <Input
                      type="number"
                      value={form.claimCooldownSec}
                      onChange={(event) => setForm((current) => ({ ...current, claimCooldownSec: Number(event.target.value) }))}
                    />
                  </Field>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div>
                    <p className="font-medium text-white">Economía activa</p>
                    <p className="text-sm text-zinc-400">Monedas por XP, voz y nivel.</p>
                  </div>
                  <Switch
                    checked={form.economyEnabled}
                    onCheckedChange={(economyEnabled) => setForm((current) => ({ ...current, economyEnabled }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div>
                    <p className="font-medium text-white">Tienda activa</p>
                    <p className="text-sm text-zinc-400">Permite comprar objetos con monedas del gacha.</p>
                  </div>
                  <Switch
                    checked={form.shopEnabled}
                    onCheckedChange={(shopEnabled) => setForm((current) => ({ ...current, shopEnabled }))}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Monedas por XP">
                    <Input
                      type="number"
                      value={form.coinsPerXp}
                      onChange={(event) => setForm((current) => ({ ...current, coinsPerXp: Number(event.target.value) }))}
                    />
                  </Field>
                  <Field label="Monedas por subir de nivel">
                    <Input
                      type="number"
                      value={form.coinsPerLevelUp}
                      onChange={(event) => setForm((current) => ({ ...current, coinsPerLevelUp: Number(event.target.value) }))}
                    />
                  </Field>
                </div>
                <FormActions onSave={handleSave} saving={saving} />
              </div>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-500/15 text-fuchsia-100">
                <Gem className="h-6 w-6" />
              </div>
              <p className="text-lg font-semibold text-white">Banner gacha</p>
              <p className="mt-2 text-sm text-zinc-300">
                {form.enabled
                  ? `Cooldown ${form.rollCooldownSec}s · economía ${form.economyEnabled ? "on" : "off"}`
                  : "El banner está desactivado en este momento."}
              </p>
            </div>
          </PaneGrid>
        ) : null}

        {tab === "economy" ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                label: "Tiradas",
                value: toStringValue(stats.totalRolls || stats.totalPulls, "0"),
                icon: <Sparkles className="h-5 w-5" />,
              },
              {
                label: "Usuarios",
                value: toStringValue(stats.totalUsers || stats.activeUsers, "0"),
                icon: <Gem className="h-5 w-5" />,
              },
              {
                label: "Colección",
                value: toStringValue(stats.totalCollection, "0"),
                icon: <ShoppingBag className="h-5 w-5" />,
              },
            ].map((item) => (
              <div key={item.label} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8">{item.icon}</div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
              </div>
            ))}
            <div className="rounded-3xl border border-white/10 bg-black/20 p-5 md:col-span-3">
              <p className="mb-4 font-medium text-white">Leaderboard rápido</p>
              <div className="space-y-2">
                {leaders.slice(0, 5).map((entry, index) => (
                  <div
                    key={`${entry.userId ?? index}`}
                    className="flex items-center justify-between rounded-2xl border border-white/8 px-4 py-3"
                  >
                    <span className="text-sm text-white">
                      {toStringValue(entry.username || entry.userTag || entry.userId, "Jugador")}
                    </span>
                    <span className="text-sm text-zinc-400">{toStringValue(entry.score || entry.points, "0")}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "shop" ? (
          <GachaShopPanel
            guildId={guildId}
            items={shop}
            premiumLocked={premiumLocked}
            onReload={reloadShop}
          />
        ) : null}

        {tab === "market" ? (
          market.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {market.map((item, index) => (
                <div key={`${item.id ?? index}`} className="rounded-3xl border border-white/10 bg-black/20 p-5">
                  <p className="font-medium text-white">{toStringValue(item.title || item.name, "Listing")}</p>
                  <p className="mt-2 text-sm text-zinc-400">{toStringValue(item.seller || item.userId, "Vendedor")}</p>
                  <p className="mt-4 text-sm text-fuchsia-200">{toStringValue(item.price, "0")} monedas</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ShoppingBag className="h-6 w-6" />}
              title="Mercado vacío"
              description="No hay listings activos en el mercado del servidor."
            />
          )
        ) : null}

        {tab === "inventory" ? (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
              <Field label="ID de usuario">
                <Input
                  value={inventoryUserId}
                  onChange={(event) => setInventoryUserId(event.target.value)}
                  placeholder="Discord user ID"
                />
              </Field>
              <Field label="Buscar carta">
                <Input
                  value={inventoryQuery}
                  onChange={(event) => setInventoryQuery(event.target.value)}
                  placeholder="Nombre, serie o rareza"
                />
              </Field>
              <div className="flex items-end">
                <Button onClick={() => void loadInventory()} disabled={inventoryLoading || premiumLocked}>
                  {inventoryLoading ? "Buscando..." : "Consultar"}
                </Button>
              </div>
            </div>
            <p className="text-sm text-zinc-400">
              {inventory.length
                ? `${inventory.length} resultados · ${inventoryTotal} cartas totales del perfil`
                : "Consulta el inventario de un miembro para revisar su colección."}
            </p>
            {inventory.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {inventory.map((item, index) => {
                  const charId = toStringValue(item.characterId || item.id);
                  return (
                  <div key={`${item.uid ?? item.id ?? index}`} className="overflow-hidden rounded-3xl border border-white/10 bg-black/20">
                    {charId ? (
                      <img src={gachaCatalogImageUrl(guildId, charId)} alt="" className="h-36 w-full object-cover" />
                    ) : null}
                    <div className="p-5">
                    <div className="mb-3 flex items-center gap-2 text-fuchsia-200">
                      <Package className="h-4 w-4" />
                      <span className="text-xs uppercase tracking-[0.2em]">
                        {toStringValue(item.rarity, "común")}
                      </span>
                    </div>
                    <p className="font-medium text-white">{toStringValue(item.name || item.characterName, "Carta")}</p>
                    <p className="mt-2 text-sm text-zinc-400">{toStringValue(item.series, "Sin serie")}</p>
                    </div>
                  </div>
                );})}
              </div>
            ) : (
              <EmptyState
                icon={<Search className="h-6 w-6" />}
                title="Sin inventario cargado"
                description="Introduce un ID y pulsa Consultar para ver las cartas."
              />
            )}
          </div>
        ) : null}

        {tab === "top" ? (
          leaders.length ? (
            <div className="space-y-3">
              <LeaderboardPodium entries={leaders as LeaderboardEntry[]} mode="gacha" />
              {leaders.slice(3, 15).map((entry, index) => (
                <LeaderboardRow
                  key={`${entry.userId ?? index}`}
                  entry={entry as LeaderboardEntry}
                  rank={index + 4}
                  mode="gacha"
                />
              ))}
            </div>
          ) : (
            <EmptyState title="Sin ranking" description="Aún no hay datos de gacha en la base de datos." />
          )
        ) : null}
      </SectionCard>
    </div>
  );
}
