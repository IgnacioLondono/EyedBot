"use client";

import { Sparkles } from "lucide-react";
import { createBillingPortal, createCheckoutSession } from "@/lib/api/endpoints";
import { usePanel } from "@/components/providers/PanelProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";

export default function PremiumPage() {
  const { billing, hasPremium } = usePanel();

  async function checkout() {
    const res = await createCheckoutSession();
    if (res.url) window.location.href = res.url;
  }

  async function portal() {
    const res = await createBillingPortal();
    if (res.url) window.location.href = res.url;
  }

  return (
    <>
      <PageHeader
        kicker="EyedPlus+"
        title="Premium del panel"
        description="Desbloquea tickets avanzados, gacha, personalización del tema y más módulos."
      />

      <Card className="border-fuchsia-500/20">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-600/20 text-fuchsia-200">
            <Sparkles className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm text-zinc-400">Estado actual</p>
            <p className="text-xl font-semibold text-white">
              {hasPremium ? "Suscripción activa" : "Sin suscripción activa"}
            </p>
            {billing?.status ? (
              <p className="text-xs text-zinc-500">Estado: {billing.status}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {hasPremium ? (
            <button
              type="button"
              onClick={() => void portal()}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
            >
              Gestionar suscripción
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void checkout()}
              className="rounded-xl bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-500"
            >
              Activar EyedPlus+
            </button>
          )}
        </div>
      </Card>
    </>
  );
}
