"use client";

import { User2 } from "lucide-react";
import { usePanel } from "@/components/providers/PanelProvider";
import { Badge } from "@/components/ui/Badge";
import { PaneGrid, SectionCard } from "@/components/features/shared";

function premiumLabel(hasPremium: boolean, grantType?: string | null) {
  if (!hasPremium) return "Plan base";
  if (grantType === "subscription") return "EyedPlus+ activo";
  if (grantType === "granted" || grantType === "allowlist") return "EyedPlus+ concedido";
  return "EyedPlus+ activo";
}

export function AccountSettings() {
  const { bootstrap, billing, hasPremium } = usePanel();
  const user = bootstrap?.user;

  return (
    <PaneGrid>
      <SectionCard title="Perfil conectado" description="Datos de la cuenta Discord con sesión activa.">
        <div className="flex items-center gap-4 rounded-[28px] border border-white/10 bg-black/20 p-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-100">
            <User2 className="h-7 w-7" />
          </div>
          <div>
            <p className="text-lg font-semibold text-white">{user?.global_name || user?.username || "Usuario"}</p>
            <p className="text-sm text-zinc-400">@{user?.username || "desconocido"}</p>
            <p className="mt-1 text-xs text-zinc-500">ID: {user?.id || "N/D"}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Estado de acceso" description="Tu plan activo dentro del panel.">
        <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
          <span className="text-sm text-zinc-400">Premium</span>
          {hasPremium ? (
            <Badge variant="premium">{premiumLabel(true, billing?.grantType)}</Badge>
          ) : (
            <Badge variant="default">Plan base</Badge>
          )}
        </div>
      </SectionCard>
    </PaneGrid>
  );
}
