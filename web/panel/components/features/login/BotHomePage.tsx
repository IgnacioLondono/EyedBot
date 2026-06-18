"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Bell,
  Bolt,
  Crown,
  DoorOpen,
  Gamepad2,
  Gift,
  Info,
  LayoutDashboard,
  Mic2,
  Palette,
  Shield,
  Sparkles,
  Ticket,
  Terminal,
  Tv,
  Zap,
} from "lucide-react";
import { EyedBotMark } from "@/components/brand/EyedBotMark";
import { EyedBotLogo } from "@/components/brand/EyedBotLogo";
import { getAboutOverview, getPanelBootstrap } from "@/lib/api/endpoints";
import type { AboutOverview } from "@/lib/types";
import { SERVER_PANES } from "@/lib/navigation";
import { Tabs } from "@/components/ui/Tabs";

const DashboardShowcase = dynamic(
  () => import("@/components/features/about/AboutShowcases").then((m) => m.DashboardShowcase),
  { loading: () => <div className="h-48 animate-pulse rounded-2xl border border-white/8 bg-white/5" />, ssr: false }
);
const OverviewShowcase = dynamic(
  () => import("@/components/features/about/AboutShowcases").then((m) => m.OverviewShowcase),
  { loading: () => <div className="h-48 animate-pulse rounded-2xl border border-white/8 bg-white/5" />, ssr: false }
);
const TicketsShowcase = dynamic(
  () => import("@/components/features/about/AboutShowcases").then((m) => m.TicketsShowcase),
  { loading: () => <div className="h-48 animate-pulse rounded-2xl border border-white/8 bg-white/5" />, ssr: false }
);
const WelcomeShowcase = dynamic(
  () => import("@/components/features/about/AboutShowcases").then((m) => m.WelcomeShowcase),
  { loading: () => <div className="h-48 animate-pulse rounded-2xl border border-white/8 bg-white/5" />, ssr: false }
);
const EmbedShowcase = dynamic(
  () => import("@/components/features/about/AboutShowcases").then((m) => m.EmbedShowcase),
  { loading: () => <div className="h-48 animate-pulse rounded-2xl border border-white/8 bg-white/5" />, ssr: false }
);
const ThemeShowcase = dynamic(
  () => import("@/components/features/about/AboutShowcases").then((m) => m.ThemeShowcase),
  { loading: () => <div className="h-48 animate-pulse rounded-2xl border border-white/8 bg-white/5" />, ssr: false }
);

const FEATURES = [
  { icon: LayoutDashboard, title: "Panel web moderno", desc: "Configura cada servidor desde el navegador sin reiniciar el bot." },
  { icon: DoorOpen, title: "Bienvenida y despedida", desc: "Embeds con variables, imágenes, tarjetas y prueba en vivo." },
  { icon: Ticket, title: "Tickets y soporte", desc: "Panel, roles de staff, gestión activa, informes e historial." },
  { icon: Bolt, title: "Niveles y economía", desc: "XP, recompensas, leaderboards con podio y monedas del gacha." },
  { icon: Shield, title: "Seguridad", desc: "Verificación, anti-spam, anti-raid y filtros configurables." },
  { icon: Bell, title: "Alertas", desc: "Directos en Twitch/YouTube, Crunchyroll y resúmenes del servidor." },
  { icon: Gift, title: "Juegos gratis", desc: "Avisos de Epic Games y Steam con embeds automáticos." },
  { icon: Gamepad2, title: "Gacha y tienda", desc: "Banner, economía, mercado e inventario gestionable desde el panel." },
  { icon: Tv, title: "Crunchyroll", desc: "Sigue series y recibe avisos cuando salga un capítulo nuevo." },
  { icon: Mic2, title: "Voz temporal", desc: "Canales dinámicos con panel de control integrado." },
  { icon: Palette, title: "EyedPlus+", desc: "Temas, fondo propio, blur y paleta completa del panel." },
  { icon: Terminal, title: "Comandos slash", desc: "Catálogo completo y documentación en el panel." },
];

const PREVIEW_TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "server", label: "Servidor" },
  { id: "welcome", label: "Bienvenida" },
  { id: "tickets", label: "Tickets" },
  { id: "embeds", label: "Embeds" },
  { id: "theme", label: "Tema" },
];

const ERROR_MESSAGES: Record<string, string> = {
  discord_error: "Discord rechazó la autorización. Inténtalo de nuevo.",
  session_error: "No se pudo crear la sesión. Vuelve a iniciar sesión.",
  no_code: "Faltó el código de autorización. Repite el proceso.",
  config_error: "Error de configuración del servidor. Contacta al administrador.",
  auth_failed: "No se pudo completar el inicio de sesión.",
  invalid_secret: "Credenciales OAuth inválidas en el servidor.",
  maintenance: "El panel está en mantenimiento. Solo el propietario puede acceder.",
  registration_closed: "Los nuevos accesos están cerrados temporalmente.",
};

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

function formatUptime(ms: number | null | undefined) {
  if (!ms || !Number.isFinite(ms)) return "—";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${Math.floor((totalSec % 3600) / 60)}m`;
}

export function BotHomePage() {
  const searchParams = useSearchParams();
  const errorKey = searchParams.get("error");
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] || "Ocurrió un error al iniciar sesión." : null;
  const [overview, setOverview] = useState<AboutOverview | null>(null);
  const [previewTab, setPreviewTab] = useState("dashboard");
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    void getAboutOverview().then(setOverview).catch(() => null);
    void getPanelBootstrap(false)
      .then(() => setLoggedIn(true))
      .catch(() => setLoggedIn(false));
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[var(--color-bg)] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="login-blob-a absolute -left-24 top-20 h-80 w-80 rounded-full bg-[#a78bfa]/20 blur-3xl" />
        <div className="login-blob-b absolute right-0 top-1/3 h-96 w-96 rounded-full bg-[#7c3aed]/15 blur-3xl" />
        <div className="login-blob-c absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-[#c4b5fd]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-8 lg:px-8 lg:py-12">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <EyedBotLogo label="EyedBot" subtitle="Bot y panel para Discord" />
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/about" className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5">
              Acerca de
            </Link>
            <Link href="/commands" className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5">
              Comandos
            </Link>
            {loggedIn ? (
              <Link
                href="/dashboard"
                className="rounded-xl border border-[color:var(--color-accent)]/35 bg-[color:var(--color-accent)]/15 px-3 py-2 text-sm font-medium text-[color:var(--color-brand-light)]"
              >
                Ir al panel
              </Link>
            ) : null}
          </div>
        </header>

        <div className="grid flex-1 items-start gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
          <div className="space-y-10">
            <section>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-[color:var(--color-brand-light)]/80">
                {overview?.botName || "EyedBot"} · en línea
              </p>
              <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
                Todo tu servidor de Discord,{" "}
                <span className="bg-gradient-to-r from-[#c4b5fd] to-[#a78bfa] bg-clip-text text-transparent">
                  en un solo panel
                </span>
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-zinc-400">
                {overview?.purpose ||
                  "Moderación, bienvenidas, tickets, niveles, alertas, gacha, embeds y personalización — configurado visualmente desde el navegador."}
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Servidores", value: overview?.totalServers ?? "—" },
                  { label: "Comandos", value: overview?.totalCommands ?? "—" },
                  { label: "Ping", value: overview?.ping != null ? `${overview.ping} ms` : "—" },
                  { label: "Uptime", value: formatUptime(overview?.uptime) },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-2xl border border-white/8 bg-black/25 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">{stat.label}</p>
                    <p className="mt-1 text-xl font-semibold text-white">{stat.value}</p>
                  </div>
                ))}
              </div>
            </section>

            <motion.section
              initial="initial"
              animate="animate"
              variants={{ animate: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } }}
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            >
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <motion.article
                    key={feature.title}
                    variants={fadeUp}
                    transition={{ duration: 0.4 }}
                    className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 backdrop-blur-sm"
                  >
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--color-accent)]/15 text-[color:var(--color-brand-light)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h2 className="font-medium text-white">{feature.title}</h2>
                    <p className="mt-1 text-sm text-zinc-400">{feature.desc}</p>
                  </motion.article>
                );
              })}
            </motion.section>

            <section>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">Vistas previa del panel</p>
                  <p className="text-sm text-zinc-500">Así se ve configurar tu servidor sin iniciar sesión.</p>
                </div>
                <Tabs items={PREVIEW_TABS} value={previewTab} onValueChange={setPreviewTab} />
              </div>
              <div className="rounded-3xl border border-white/8 bg-black/20 p-2">
                {previewTab === "dashboard" ? <DashboardShowcase /> : null}
                {previewTab === "server" ? <OverviewShowcase /> : null}
                {previewTab === "welcome" ? <WelcomeShowcase /> : null}
                {previewTab === "tickets" ? <TicketsShowcase /> : null}
                {previewTab === "embeds" ? <EmbedShowcase /> : null}
                {previewTab === "theme" ? <ThemeShowcase /> : null}
              </div>
            </section>

            <section className="rounded-3xl border border-white/8 bg-black/20 p-5">
              <p className="mb-4 text-sm font-medium text-white">Módulos del servidor</p>
              <div className="flex flex-wrap gap-2">
                {SERVER_PANES.map((pane) => (
                  <span
                    key={pane.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300"
                  >
                    <pane.icon className="h-3.5 w-3.5 text-violet-300" />
                    {pane.label}
                    {pane.premium ? <Crown className="h-3 w-3 text-fuchsia-300" /> : null}
                  </span>
                ))}
              </div>
            </section>
          </div>

          <aside id="entrar" className="lg:sticky lg:top-10">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
              <EyedBotMark className="eyedbot-mark-glow mx-auto mb-5 h-16 w-16 rounded-[22px]" />
              <h2 className="text-center text-2xl font-bold text-white">
                {loggedIn ? "Bienvenido de nuevo" : "Entrar al panel"}
              </h2>
              <p className="mt-2 text-center text-sm text-zinc-400">
                {loggedIn
                  ? "Ya tienes sesión activa. Continúa configurando tus servidores."
                  : "Usa tu cuenta de Discord. Solo verás servidores donde tengas permisos de administración."}
              </p>

              {errorMessage ? (
                <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {errorMessage}
                </div>
              ) : null}

              {loggedIn ? (
                <Link
                  href="/dashboard"
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,var(--color-accent),var(--color-accent-2))] px-4 py-3.5 text-sm font-semibold text-white"
                >
                  <LayoutDashboard className="h-5 w-5" />
                  Abrir dashboard
                </Link>
              ) : (
                <a
                  href="/auth/discord"
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#4752c4]"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 12.3 12.3 0 0 0-.608 1.25 18.3 18.3 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.08.08 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107 14.322 14.322 0 0 0 1.225 1.993.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                  Continuar con Discord
                </a>
              )}

              <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs text-zinc-500">
                <Link href="/premium" className="inline-flex items-center gap-1 hover:text-zinc-300">
                  <Sparkles className="h-3.5 w-3.5" /> EyedPlus+
                </Link>
                <span>·</span>
                <a href="https://discord.gg/eN6eQdGn87" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300">
                  Soporte
                </a>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
