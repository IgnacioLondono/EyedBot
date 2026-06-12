"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePanel } from "@/components/providers/PanelProvider";
import { SETTINGS_NAV } from "@/lib/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { AccountSettings } from "@/components/features/settings/AccountSettings";
import { OwnerSettings } from "@/components/features/settings/OwnerSettings";
import { WebSettings } from "@/components/features/settings/WebSettings";
import { ThemeSettings } from "@/components/features/settings/ThemeSettings";

const PANE_COPY: Record<string, { title: string; body: string }> = {
  account: {
    title: "Cuenta",
    body: "Perfil de Discord conectado al panel y preferencias de sesión.",
  },
  owner: {
    title: "Propietario",
    body: "Estadísticas globales, registros de login y herramientas de administración.",
  },
  web: {
    title: "Sistema",
    body: "Ajustes del panel web y comportamiento general.",
  },
  theme: {
    title: "Personalización",
    body: "Colores, atmósfera y fondo del panel (EyedPlus+).",
  },
};

const SETTINGS_COMPONENTS = {
  account: AccountSettings,
  owner: OwnerSettings,
  web: WebSettings,
  theme: ThemeSettings,
} satisfies Record<string, ComponentType>;

type SettingsPaneSlug = keyof typeof SETTINGS_COMPONENTS;

export default function SettingsPage() {
  const params = useParams<{ pane?: string[] }>();
  const pane = params.pane?.[0] || "account";
  const { bootstrap, hasPremium } = usePanel();
  const copy = PANE_COPY[pane] || PANE_COPY.account;
  const SettingsComponent = SETTINGS_COMPONENTS[pane as SettingsPaneSlug] || AccountSettings;

  const visibleNav = SETTINGS_NAV.filter((item) => {
    if (item.href.includes("/owner") && !bootstrap?.isOwner) return false;
    return true;
  });

  return (
    <>
      <PageHeader
        kicker="Configuración"
        title={copy.title}
        description={copy.body}
        actions={pane === "theme" && !hasPremium ? <Badge variant="premium">Premium</Badge> : null}
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="flex flex-row gap-2 overflow-x-auto lg:flex-col">
          {visibleNav.map((item) => {
            const slug = item.href.split("/").pop() || "account";
            const active = pane === slug;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm whitespace-nowrap ${
                  active ? "bg-violet-600/25 text-white" : "text-zinc-400 hover:bg-white/5"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
                {item.premium && !hasPremium ? (
                  <span className="text-[10px] text-fuchsia-300">+</span>
                ) : null}
              </Link>
            );
          })}
        </aside>

        <SettingsComponent />
      </div>
    </>
  );
}
