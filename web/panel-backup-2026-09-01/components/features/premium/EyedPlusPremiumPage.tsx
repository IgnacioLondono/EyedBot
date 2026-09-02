"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Check,
  ChevronRight,
  CreditCard,
  Crown,
  Lock,
  LockOpen,
  Sparkles,
  Zap,
} from "lucide-react";
import { usePanel } from "@/components/providers/PanelProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  createBillingPortal,
  createCheckoutSession,
  getBillingPlan,
} from "@/lib/api/endpoints";
import {
  EYEDPLUS_FAQ,
  EYEDPLUS_FEATURES,
  EYEDPLUS_FREE_FEATURES,
  formatPlanPrice,
} from "@/lib/eyedplus";
import type { BillingPlan } from "@/lib/types";

const BILLING_MESSAGES: Record<string, { tone: "success" | "error"; text: string }> = {
  success: {
    tone: "success",
    text: "¡Pago confirmado! EyedPlus+ ya está activo en tu cuenta.",
  },
  failed: {
    tone: "error",
    text: "El pago no fue autorizado. Puedes intentarlo de nuevo.",
  },
  error: {
    tone: "error",
    text: "Hubo un problema al confirmar el pago. Si se descontó, contacta soporte.",
  },
  cancelled: {
    tone: "error",
    text: "Cancelaste el proceso de pago.",
  },
};

function formatDate(iso?: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

export function EyedPlusPremiumPage() {
  const searchParams = useSearchParams();
  const { billing, hasPremium, refresh } = usePanel();
  const [plan, setPlan] = useState<BillingPlan | null>(null);
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const billingNotice = searchParams.get("billing");
  const grantLabel = useMemo(() => {
    if (billing?.grantType === "owner") return "Cuenta owner";
    if (billing?.grantType === "allowlist") return "Acceso concedido";
    if (billing?.grantType === "subscription") return "Suscripción activa";
    return hasPremium ? "Activo" : "Sin plan";
  }, [billing?.grantType, hasPremium]);

  useEffect(() => {
    void getBillingPlan()
      .then(setPlan)
      .catch(() => setPlan(null));
  }, []);

  useEffect(() => {
    if (!billingNotice) return;
    const message = BILLING_MESSAGES[billingNotice];
    if (message) setBanner(message);
    if (billingNotice === "success") void refresh();
  }, [billingNotice, refresh]);

  const checkout = useCallback(async () => {
    setActionError(null);
    setLoadingCheckout(true);
    try {
      const res = await createCheckoutSession();
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      setActionError("No se pudo iniciar el pago. Revisa la configuración del servidor.");
    } catch {
      setActionError("Error al conectar con el proveedor de pagos.");
    } finally {
      setLoadingCheckout(false);
    }
  }, []);

  const portal = useCallback(async () => {
    setActionError(null);
    setLoadingPortal(true);
    try {
      const res = await createBillingPortal();
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      if (res.message) {
        setBanner({ tone: "success", text: res.message });
        await refresh();
        return;
      }
      setActionError("No se pudo gestionar la renovación.");
    } catch {
      setActionError("Error al gestionar tu plan.");
    } finally {
      setLoadingPortal(false);
    }
  }, [refresh]);

  const priceLabel = plan?.configured
    ? formatPlanPrice(plan.monthlyAmount, plan.currency)
    : "—";

  const paymentLabel = plan?.paymentLabel || "WebPay";
  const periodDays = plan?.periodDays || 30;

  return (
    <div className="space-y-8 pb-10">
      {banner ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            banner.tone === "success"
              ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
              : "border-red-400/25 bg-red-500/10 text-red-100"
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      <section className="relative overflow-hidden rounded-3xl border border-fuchsia-400/20 bg-[linear-gradient(135deg,rgba(88,28,135,0.45),rgba(30,10,60,0.85))] p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-fuchsia-500/25 blur-3xl login-blob-a" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-violet-400/20 blur-3xl login-blob-b" />

        <motion.div
          initial="hidden"
          animate="show"
          variants={fadeUp}
          transition={{ duration: 0.45 }}
          className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/25 bg-fuchsia-500/15 px-3 py-1 text-xs font-medium uppercase tracking-wider text-fuchsia-100">
              <Sparkles className="h-3.5 w-3.5" />
              EyedPlus+
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Desbloquea el panel completo
            </h1>
            <p className="text-base leading-relaxed text-fuchsia-100/80 sm:text-lg">
              Tickets avanzados, gacha, seguridad pro, juegos gratis, personalización total y más.
              Paga con {paymentLabel} y activa mejoras al instante.
            </p>
          </div>

          <Card className="w-full max-w-sm border-fuchsia-300/20 bg-black/25">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-500/20 text-fuchsia-200">
                <Crown className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-400">Tu estado</p>
                <p className="text-lg font-semibold text-white">{grantLabel}</p>
                {billing?.currentPeriodEnd ? (
                  <p className="text-xs text-zinc-400">
                    Vence: {formatDate(billing.currentPeriodEnd)}
                  </p>
                ) : null}
                {billing?.cancelAtPeriodEnd ? (
                  <p className="text-xs text-amber-300">No se renovará automáticamente</p>
                ) : null}
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              {hasPremium && billing?.grantType === "subscription" ? (
                <Button
                  variant="secondary"
                  className="w-full"
                  loading={loadingPortal}
                  onClick={() => void portal()}
                >
                  No renovar al vencer
                </Button>
              ) : hasPremium ? null : (
                <Button
                  className="w-full"
                  size="lg"
                  loading={loadingCheckout}
                  disabled={!plan?.configured}
                  onClick={() => void checkout()}
                >
                  <CreditCard className="h-4 w-4" />
                  Pagar con {paymentLabel}
                </Button>
              )}
              {!hasPremium && !plan?.configured ? (
                <p className="text-center text-xs text-zinc-500">
                  Pagos no configurados en el servidor.
                </p>
              ) : null}
              {actionError ? (
                <p className="text-center text-xs text-red-300">{actionError}</p>
              ) : null}
            </div>
          </Card>
        </motion.div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-white/10">
          <div className="mb-5 flex items-center gap-2">
            <LockOpen className="h-5 w-5 text-fuchsia-300" />
            <h2 className="text-lg font-semibold text-white">Comparativa Free vs Plus</h2>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/8">
            <div className="grid grid-cols-3 bg-white/5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <div className="px-4 py-3">Función</div>
              <div className="px-4 py-3 text-center">Free</div>
              <div className="px-4 py-3 text-center text-fuchsia-200">EyedPlus+</div>
            </div>

            {EYEDPLUS_FREE_FEATURES.map((feature) => (
              <div
                key={feature}
                className="grid grid-cols-3 border-t border-white/6 text-sm"
              >
                <div className="px-4 py-3 text-zinc-300">{feature}</div>
                <div className="flex items-center justify-center px-4 py-3">
                  <Check className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="flex items-center justify-center px-4 py-3">
                  <Check className="h-4 w-4 text-fuchsia-300" />
                </div>
              </div>
            ))}

            {EYEDPLUS_FEATURES.map((feature) => (
              <div
                key={feature.id}
                className="grid grid-cols-3 border-t border-white/6 text-sm"
              >
                <div className="px-4 py-3 text-zinc-300">{feature.title}</div>
                <div className="flex items-center justify-center px-4 py-3">
                  <Lock className="h-4 w-4 text-zinc-600" />
                </div>
                <div className="flex items-center justify-center px-4 py-3">
                  <Check className="h-4 w-4 text-fuchsia-300" />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="relative overflow-hidden border-fuchsia-400/25 bg-[linear-gradient(160deg,rgba(76,29,149,0.35),rgba(15,10,30,0.9))]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(217,70,239,0.18),transparent_55%)]" />
          <div className="relative space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-fuchsia-500/20 px-3 py-1 text-xs font-medium text-fuchsia-100">
              <Zap className="h-3.5 w-3.5" />
              Plan mensual
            </div>
            <div>
              <p className="text-4xl font-bold text-white">{priceLabel}</p>
              <p className="mt-1 text-sm text-zinc-400">
                por {periodDays} días · {plan?.productName || "EyedPlus+ mensual"}
              </p>
            </div>

            <ul className="space-y-2 text-sm text-zinc-300">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-300" />
                Pago seguro con {paymentLabel} (Transbank)
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-300" />
                Activación inmediata tras confirmar el pago
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-300" />
                Todos los módulos premium del panel incluidos
              </li>
            </ul>

            {!hasPremium ? (
              <Button
                className="w-full"
                size="lg"
                loading={loadingCheckout}
                disabled={!plan?.configured}
                onClick={() => void checkout()}
              >
                Desbloquear EyedPlus+
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                Ya tienes EyedPlus+ activo. Explora los módulos premium en tus servidores.
              </div>
            )}

            <p className="text-center text-[11px] text-zinc-500">
              Al pagar aceptas activar EyedPlus+ en tu cuenta de Discord vinculada al panel.
            </p>
          </div>
        </Card>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-fuchsia-300" />
          <h2 className="text-lg font-semibold text-white">Módulos que desbloqueas</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {EYEDPLUS_FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            const unlocked = hasPremium;
            return (
              <motion.div
                key={feature.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <Card
                  className={`h-full transition-colors ${
                    unlocked
                      ? "border-fuchsia-400/25 bg-fuchsia-500/8"
                      : "border-white/8 opacity-90"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        unlocked ? "bg-fuchsia-500/25 text-fuchsia-100" : "bg-white/8 text-zinc-400"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    {unlocked ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-200">
                        Desbloqueado
                      </span>
                    ) : (
                      <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-500">
                        Plus
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 font-semibold text-white">{feature.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-400">{feature.description}</p>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">Preguntas frecuentes</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {EYEDPLUS_FAQ.map((item) => (
            <Card key={item.q} className="border-white/8">
              <h3 className="font-medium text-white">{item.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{item.a}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
