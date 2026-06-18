"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePanel } from "@/components/providers/PanelProvider";
import { SETTINGS_NAV } from "@/lib/navigation";
import { filterSettingsNav } from "@/lib/web-config";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { AccountSettings } from "@/components/features/settings/AccountSettings";
import { OwnerSettings } from "@/components/features/settings/OwnerSettings";
import { ThemeSettings } from "@/components/features/settings/ThemeSettings";
import { ModuleContent, ModuleSidebar } from "@/components/features/shared";

const PANE_COPY: Record<string, { title: string; body: string }> = {
  account: {
    title: "Cuenta",
    body: "Perfil de Discord conectado al panel y preferencias de sesión.",
  },
  owner: {
    title: "Propietario",
    body: "Usuarios, EyedPlus+, configuración web, bots, logs y sistema (solo creador).",
  },
  theme: {
    title: "Personalización",
    body: "Colores, atmósfera y fondo del panel.",
  },
};

const SETTINGS_COMPONENTS = {
  account: AccountSettings,
  owner: OwnerSettings,
  theme: ThemeSettings,
} satisfies Record<string, ComponentType>;

type SettingsPaneSlug = keyof typeof SETTINGS_COMPONENTS;

export default function SettingsPage() {
  const params = useParams<{ pane?: string[] }>();
  const router = useRouter();
  const pane = params.pane?.[0] || "account";
  const { bootstrap, premiumLocked } = usePanel();
  const isRealOwner = Boolean(bootstrap?.isRealOwner ?? bootstrap?.isOwner);
  const copy = PANE_COPY[pane] || PANE_COPY.account;
  const SettingsComponent = SETTINGS_COMPONENTS[pane as SettingsPaneSlug] || AccountSettings;

  useEffect(() => {
    if (pane === "web") router.replace("/settings/owner");
    if (pane === "owner" && !isRealOwner) router.replace("/settings/account");
  }, [pane, isRealOwner, router]);

  const visibleNav = filterSettingsNav(
    SETTINGS_NAV.filter((item) => {
      if (item.href.includes("/owner")) return isRealOwner;
      return true;
    }),
    bootstrap?.webConfig
  );

  return (
    <>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6 xl:gap-8">
        <ModuleSidebar className="lg:w-48">
          {visibleNav.map((item) => {
            const slug = item.href.split("/").pop() || "account";
            const active = pane === slug;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm whitespace-nowrap ${
                  active ? "bg-violet-600/25 text-white" : "text-zinc-400 hover:bg-white/5"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
                {item.premium && premiumLocked ? (
                  <span className="text-[10px] text-fuchsia-300">+</span>
                ) : null}
              </Link>
            );
          })}
        </ModuleSidebar>

        <ModuleContent>
          <PageHeader
            kicker="Configuración"
            title={copy.title}
            description={copy.body}
            actions={pane === "theme" && premiumLocked ? <Badge variant="premium">Premium</Badge> : null}
          />
          <div className="mt-5">
            {pane === "owner" && !isRealOwner ? (
              <Alert title="Acceso restringido" description="El panel de propietario solo está disponible para el creador del bot." variant="danger" />
            ) : (
              <SettingsComponent />
            )}
          </div>
        </ModuleContent>
      </div>
    </>
  );
}
