"use client";

import { useEffect, useState } from "react";
import { Gem, ShoppingBag, Sparkles } from "lucide-react";
import {
  getGachaConfig,
  getGachaLeaderboard,
  getGachaShop,
  getGachaStats,
  saveGachaConfig,
} from "@/lib/api/endpoints";
import { usePanel } from "@/components/providers/PanelProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
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
} from "@/components/features/shared";
import { asArray, asRecord, getErrorMessage, toBooleanValue, toNumberValue, toStringValue } from "@/lib/utils";

type GachaState = {
  enabled: boolean;
  dailyPulls: number;
  bannerName: string;
};

export function GachaPane({ guildId }: { guildId: string }) {
  const { hasPremium } = usePanel();
  const { toast } = useToast();
  const [tab, setTab] = useState("config");
  const [form, setForm] = useState<GachaState>({ enabled: false, dailyPulls: 3, bannerName: "" });
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [shop, setShop] = useState<Record<string, unknown>[]>([]);
  const [leaders, setLeaders] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getGachaConfig(guildId),
      getGachaStats(guildId),
      getGachaShop(guildId),
      getGachaLeaderboard(guildId),
    ])
      .then(([configData, statsData, shopData, leaderboardData]) => {
        if (!active) return;
        const config = asRecord(configData);
        setForm({
          enabled: toBooleanValue(config.enabled),
          dailyPulls: toNumberValue(config.dailyPulls, 3),
          bannerName: toStringValue(config.bannerName || config.banner, "Banner principal"),
        });
        setStats(asRecord(statsData));
        setShop(asArray(shopData).map((entry) => asRecord(entry)));
        setLeaders(asArray(leaderboardData).map((entry) => asRecord(entry)));
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
      <LockedOverlay visible={!hasPremium} title="Gacha premium" description="El sistema gacha, tienda y estadísticas avanzadas requieren una suscripción activa." />
      <SectionCard
        title="Centro gacha"
        description="Administra banner, economía ligera y actividad del sistema."
        action={<PremiumLock locked={!hasPremium} />}
      >
        <Tabs
          items={[
            { id: "config", label: "Config" },
            { id: "stats", label: "Stats" },
            { id: "shop", label: "Shop" },
          ]}
          value={tab}
          onValueChange={setTab}
          className="mb-6"
        />

        {tab === "config" ? (
          <PaneGrid>
            <div className={!hasPremium ? "pointer-events-none opacity-50" : ""}>
              <div className="space-y-5">
                <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div>
                    <p className="font-medium text-white">Activar banner</p>
                    <p className="text-sm text-zinc-400">Permite tiradas diarias y recompensas.</p>
                  </div>
                  <Switch checked={form.enabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))} />
                </div>
                <Field label="Nombre del banner">
                  <Input value={form.bannerName} onChange={(event) => setForm((current) => ({ ...current, bannerName: event.target.value }))} />
                </Field>
                <Field label="Tiradas diarias">
                  <Input type="number" value={form.dailyPulls} onChange={(event) => setForm((current) => ({ ...current, dailyPulls: Number(event.target.value) }))} />
                </Field>
                <FormActions onSave={handleSave} saving={saving} />
              </div>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-500/15 text-fuchsia-100">
                <Gem className="h-6 w-6" />
              </div>
              <p className="text-lg font-semibold text-white">{form.bannerName}</p>
              <p className="mt-2 text-sm text-zinc-300">
                {form.enabled
                  ? `${form.dailyPulls} tiradas por día activas para la comunidad.`
                  : "El banner está desactivado en este momento."}
              </p>
            </div>
          </PaneGrid>
        ) : null}

        {tab === "stats" ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Tiradas", value: toStringValue(stats.totalPulls, "0"), icon: <Sparkles className="h-5 w-5" /> },
              { label: "Usuarios", value: toStringValue(stats.activeUsers, "0"), icon: <Gem className="h-5 w-5" /> },
              { label: "Top score", value: toStringValue(stats.highestScore, "0"), icon: <ShoppingBag className="h-5 w-5" /> },
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
                  <div key={`${entry.userId ?? index}`} className="flex items-center justify-between rounded-2xl border border-white/8 px-4 py-3">
                    <span className="text-sm text-white">{toStringValue(entry.username || entry.userTag || entry.userId, "Jugador")}</span>
                    <span className="text-sm text-zinc-400">{toStringValue(entry.score || entry.points, "0")}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "shop" ? (
          shop.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {shop.map((item, index) => (
                <div key={`${item.id ?? index}`} className="rounded-3xl border border-white/10 bg-black/20 p-5">
                  <p className="font-medium text-white">{toStringValue(item.name, "Item")}</p>
                  <p className="mt-2 text-sm text-zinc-400">{toStringValue(item.description, "Sin descripción")}</p>
                  <p className="mt-4 text-sm text-fuchsia-200">{toStringValue(item.price, "0")} monedas</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<ShoppingBag className="h-6 w-6" />} title="Tienda vacía" description="No hay artículos cargados en la tienda del servidor." />
          )
        ) : null}
      </SectionCard>
    </div>
  );
}
