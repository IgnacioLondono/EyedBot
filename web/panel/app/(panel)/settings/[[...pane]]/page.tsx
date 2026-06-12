"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { usePanel } from "@/components/providers/PanelProvider";
import { SETTINGS_NAV } from "@/lib/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";

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

export default function SettingsPage() {
  const params = useParams<{ pane?: string[] }>();
  const pane = params.pane?.[0] || "account";
  const { bootstrap, hasPremium } = usePanel();
  const user = bootstrap?.user;
  const copy = PANE_COPY[pane] || PANE_COPY.account;

  const visibleNav = SETTINGS_NAV.filter((item) => {
    if (item.href.includes("/owner") && !bootstrap?.isOwner) return false;
    return true;
  });

  return (
    <>
      <PageHeader kicker="Configuración" title={copy.title} description={copy.body} />

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

        <Card>
          {pane === "account" && user ? (
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-zinc-500">Usuario:</span> {user.global_name || user.username}
              </p>
              <p>
                <span className="text-zinc-500">ID:</span> {user.id}
              </p>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">
              Módulo <strong className="text-white">{copy.title}</strong> en construcción en el panel
              Next.js. Las APIs ya están disponibles en <code className="text-violet-300">lib/api/endpoints.ts</code>.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
