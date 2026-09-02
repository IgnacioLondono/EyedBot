"use client";

import type { ComponentType } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePanel } from "@/components/providers/PanelProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { AccountSettings } from "@/components/features/settings/AccountSettings";
import { OwnerSettings } from "@/components/features/settings/OwnerSettings";
import { ThemeSettings } from "@/components/features/settings/ThemeSettings";

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

  return (
    <div className="w-full space-y-6">
      <PageHeader
        kicker="Configuración"
        title={copy.title}
        description={copy.body}
        actions={pane === "theme" && premiumLocked ? <Badge variant="premium">Premium</Badge> : null}
      />
      {pane === "owner" && !isRealOwner ? (
        <Alert title="Acceso restringido" description="El panel de propietario solo está disponible para el creador del bot." variant="danger" />
      ) : (
        <SettingsComponent />
      )}
    </div>
  );
}
