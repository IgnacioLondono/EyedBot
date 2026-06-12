"use client";

import { ShieldCheck, User2 } from "lucide-react";
import { usePanel } from "@/components/providers/PanelProvider";
import { Badge } from "@/components/ui/Badge";
import { PaneGrid, SectionCard } from "@/components/features/shared";

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

      <SectionCard title="Estado de acceso" description="Tu sesión y el plan activo dentro del panel.">
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
            <span className="text-sm text-zinc-400">Premium</span>
            <Badge variant={hasPremium ? "premium" : "default"}>
              {hasPremium ? "EyedPlus+ activo" : "Plan base"}
            </Badge>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
            <span className="text-sm text-zinc-400">Estado facturación</span>
            <span className="text-sm text-white">{billing?.status || "Sin suscripción"}</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
            <span className="text-sm text-zinc-400">Permisos owner</span>
            <Badge variant={bootstrap?.isOwner ? "success" : "default"}>
              {bootstrap?.isOwner ? "Habilitado" : "No"}
            </Badge>
          </div>
          <div className="rounded-2xl border border-white/8 bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.2),_rgba(0,0,0,0.1)_55%)] p-4 text-sm text-zinc-300">
            <div className="mb-2 flex items-center gap-2 text-white">
              <ShieldCheck className="h-4 w-4" />
              Sesión segura
            </div>
            Tu sesión web usa el bootstrap del panel y conserva los permisos vinculados a tu cuenta de Discord.
          </div>
        </div>
      </SectionCard>
    </PaneGrid>
  );
}
