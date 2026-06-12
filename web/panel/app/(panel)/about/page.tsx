"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Bell,
  Bolt,
  Crown,
  DoorOpen,
  LayoutGrid,
  Palette,
  Shield,
  Sparkles,
  Ticket,
  Terminal,
} from "lucide-react";
import { getAboutOverview } from "@/lib/api/endpoints";
import type { AboutOverview } from "@/lib/types";
import { SERVER_PANES } from "@/lib/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import {
  DashboardShowcase,
  EmbedShowcase,
  OverviewShowcase,
  ThemeShowcase,
  TicketsShowcase,
  WelcomeShowcase,
} from "@/components/features/about/AboutShowcases";
import { EyedBioPromo } from "@/components/features/about/EyedBioPromo";

const ABOUT_TABS = [
  { id: "overview", label: "General" },
  { id: "modules", label: "Módulos" },
  { id: "panel", label: "Panel web" },
  { id: "premium", label: "EyedPlus+" },
  { id: "guide", label: "Guía rápida" },
];

const HIGHLIGHT_MODULES = [
  { icon: LayoutGrid, title: "Resumen", desc: "Estadísticas, gráficos y drill-down de miembros, canales y actividad." },
  { icon: DoorOpen, title: "Bienvenida", desc: "Embeds personalizables con variables, colores y prueba en vivo." },
  { icon: Ticket, title: "Tickets", desc: "Panel, roles por caso, gestión activa, chat e informes." },
  { icon: Bolt, title: "Niveles", desc: "XP, recompensas por rol, canal dedicado y leaderboards con podio." },
  { icon: Shield, title: "Seguridad", desc: "Anti-spam, anti-raid y filtros de contenido configurables." },
  { icon: Bell, title: "Alertas", desc: "Avisos de directos en Twitch, YouTube y más." },
  { icon: Palette, title: "Personalización", desc: "Temas, fondo propio, blur on/off y paleta completa." },
  { icon: Terminal, title: "Comandos", desc: "Catálogo completo disponible en la sección Comandos del panel." },
];

export default function AboutPage() {
  const [overview, setOverview] = useState<AboutOverview | null>(null);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    void getAboutOverview().then(setOverview).catch(() => null);
  }, []);

  return (
    <>
      <PageHeader
        kicker="Acerca de"
        title={overview?.botName ? `Conoce ${overview.botName}` : "Conoce EyedBot"}
        description="Bot y panel web para moderar, automatizar y hacer crecer tu comunidad de Discord."
        actions={
          <Link
            href="/premium"
            className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-sm text-fuchsia-100"
          >
            <Sparkles className="h-4 w-4" />
            EyedPlus+
          </Link>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Servidores</p>
          <p className="mt-2 text-3xl font-bold text-white">
            {overview ? overview.totalServers.toLocaleString("es-ES") : "—"}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Comandos</p>
          <p className="mt-2 text-3xl font-bold text-white">
            {overview ? overview.totalCommands.toLocaleString("es-ES") : "—"}
          </p>
        </Card>
      </div>

      <Tabs items={ABOUT_TABS} value={tab} onValueChange={setTab} className="mb-6 w-full" />

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {tab === "overview" ? (
          <>
            <Card>
              <h2 className="text-xl font-semibold text-white">¿Qué es EyedBot?</h2>
              <p className="mt-3 text-zinc-300">
                {overview?.purpose ||
                  "Ayudar a gestionar comunidades de Discord con herramientas de organización, moderación y participación."}
              </p>
              <p className="mt-3 text-zinc-400">
                Combina comandos en Discord con un panel web moderno donde configuras bienvenidas, tickets, niveles,
                alertas de directos, seguridad, gacha y más sin tocar archivos ni reiniciar el bot.
              </p>
            </Card>
            <EyedBioPromo />
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-medium text-zinc-400">Ejemplo: dashboard</h3>
                <DashboardShowcase />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-medium text-zinc-400">Ejemplo: resumen del servidor</h3>
                <OverviewShowcase />
              </div>
            </div>
          </>
        ) : null}

        {tab === "modules" ? (
          <>
            <Card>
              <h2 className="text-xl font-semibold text-white">Módulos por servidor</h2>
              <p className="mt-2 text-zinc-400">
                Cada comunidad tiene su propio espacio con barra lateral de módulos y scroll independiente en pantallas
                grandes.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {SERVER_PANES.map((pane) => (
                  <Badge key={pane.id} variant={pane.premium ? "premium" : "default"}>
                    {pane.label}
                    {pane.premium ? "+" : ""}
                  </Badge>
                ))}
              </div>
            </Card>
            <div className="grid gap-4 sm:grid-cols-2">
              {HIGHLIGHT_MODULES.map((item) => {
                const Icon = item.icon;
                return (
                  <Card key={item.title} className="p-4">
                    <div className="mb-2 flex items-center gap-2 text-white">
                      <Icon className="h-4 w-4 text-violet-300" />
                      <span className="font-medium">{item.title}</span>
                    </div>
                    <p className="text-sm text-zinc-400">{item.desc}</p>
                  </Card>
                );
              })}
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-medium text-zinc-400">Ejemplo: tickets</h3>
                <TicketsShowcase />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-medium text-zinc-400">Ejemplo: bienvenida</h3>
                <WelcomeShowcase />
              </div>
            </div>
          </>
        ) : null}

        {tab === "panel" ? (
          <>
            <Card>
              <h2 className="text-xl font-semibold text-white">Panel web</h2>
              <ul className="mt-4 space-y-2 text-sm text-zinc-300">
                <li>· Login con Discord y lista de servidores donde tienes permisos de gestión.</li>
                <li>· Selectores de canales y roles en lugar de pegar IDs manualmente.</li>
                <li>· Color pickers en embeds, tickets, bienvenida y alertas.</li>
                <li>· Constructor de embeds con campos, autor, imágenes y plantillas.</li>
                <li>· Fondo personalizado con toggle de blur para ver la imagen nítida.</li>
                <li>· Favoritos en el dashboard y búsqueda rápida de servidores.</li>
              </ul>
            </Card>
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-medium text-zinc-400">Ejemplo: personalización</h3>
                <ThemeShowcase />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-medium text-zinc-400">Ejemplo: embeds</h3>
                <EmbedShowcase />
              </div>
            </div>
          </>
        ) : null}

        {tab === "premium" ? (
          <Card>
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-500/15 text-fuchsia-200">
                <Crown className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">EyedPlus+</h2>
                <p className="mt-2 text-zinc-300">
                  Desbloquea módulos avanzados y personalización completa del panel: tickets, gacha, seguridad, juegos
                  gratis, temas y fondo propio.
                </p>
                <ul className="mt-4 space-y-2 text-sm text-zinc-400">
                  <li>· Tickets con gestión completa, historial e informes.</li>
                  <li>· Gacha con catálogo, inventario y mercado.</li>
                  <li>· Anti-raid y filtros de contenido avanzados.</li>
                  <li>· Studio de tema con presets, wallpaper y blur configurable.</li>
                </ul>
                <Link
                  href="/premium"
                  className="mt-5 inline-flex rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-medium text-white"
                >
                  Ver planes EyedPlus+
                </Link>
              </div>
            </div>
          </Card>
        ) : null}

        {tab === "guide" ? (
          <Card>
            <h2 className="text-xl font-semibold text-white">Guía rápida</h2>
            <ol className="mt-4 space-y-4 text-sm text-zinc-300">
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-xs font-bold text-white">1</span>
                <span>Invita el bot a tu servidor desde el dashboard o el botón «Añadir bot».</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-xs font-bold text-white">2</span>
                <span>Entra al servidor en el panel y configura Bienvenida o Verificación primero.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-xs font-bold text-white">3</span>
                <span>Activa Tickets o Niveles según lo que necesite tu comunidad.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-xs font-bold text-white">4</span>
                <span>En Configuración → Personalización sube un fondo y desactiva el blur si quieres verlo nítido.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-xs font-bold text-white">5</span>
                <span>Consulta Comandos para ver todo lo disponible en Discord.</span>
              </li>
            </ol>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/dashboard" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white hover:bg-white/5">
                Ir al dashboard
              </Link>
              <Link href="/commands" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5">
                Ver comandos
              </Link>
            </div>
          </Card>
        ) : null}
      </motion.div>
    </>
  );
}
