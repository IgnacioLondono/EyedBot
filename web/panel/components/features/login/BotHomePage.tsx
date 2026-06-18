"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Bell,
  Bolt,
  ChevronDown,
  Crown,
  DoorOpen,
  LayoutDashboard,
  Palette,
  Shield,
  Sparkles,
  Ticket,
  Tv,
} from "lucide-react";
import { EyedBotMark } from "@/components/brand/EyedBotMark";
import { EyedBotLogo } from "@/components/brand/EyedBotLogo";
import { getAboutOverview, getPanelBootstrap } from "@/lib/api/endpoints";
import type { AboutOverview } from "@/lib/types";
import { cn } from "@/lib/utils";

const WelcomeShowcase = dynamic(
  () => import("@/components/features/about/AboutShowcases").then((m) => m.WelcomeShowcase),
  { loading: () => <PreviewSkeleton />, ssr: false }
);
const OverviewShowcase = dynamic(
  () => import("@/components/features/about/AboutShowcases").then((m) => m.OverviewShowcase),
  { loading: () => <PreviewSkeleton />, ssr: false }
);
const TicketsShowcase = dynamic(
  () => import("@/components/features/about/AboutShowcases").then((m) => m.TicketsShowcase),
  { loading: () => <PreviewSkeleton />, ssr: false }
);
const LevelingShowcase = dynamic(
  () => import("@/components/features/about/AboutShowcases").then((m) => m.LevelingShowcase),
  { loading: () => <PreviewSkeleton />, ssr: false }
);
const AlertsShowcase = dynamic(
  () => import("@/components/features/about/AboutShowcases").then((m) => m.AlertsShowcase),
  { loading: () => <PreviewSkeleton />, ssr: false }
);
const EmbedShowcase = dynamic(
  () => import("@/components/features/about/AboutShowcases").then((m) => m.EmbedShowcase),
  { loading: () => <PreviewSkeleton />, ssr: false }
);
const InteractionsShowcase = dynamic(
  () => import("@/components/features/about/AboutShowcases").then((m) => m.InteractionsShowcase),
  { loading: () => <PreviewSkeleton />, ssr: false }
);

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

const ThemeShowcase = dynamic(
  () => import("@/components/features/about/AboutShowcases").then((m) => m.ThemeShowcase),
  { loading: () => <PreviewSkeleton />, ssr: false }
);

const MODULE_LINKS = [
  { href: "#interacciones", label: "Interacciones" },
  { href: "#embeds", label: "Embeds" },
  { href: "#bienvenidas", label: "Bienvenidas" },
  { href: "#panel", label: "Panel web" },
  { href: "#tickets", label: "Tickets" },
  { href: "#niveles", label: "Niveles" },
  { href: "#alertas", label: "Alertas" },
  { href: "#eyedplus", label: "EyedPlus+" },
];

function PreviewSkeleton() {
  return <div className="h-56 animate-pulse rounded-2xl border border-white/8 bg-white/[0.04]" />;
}

function DiscordAppBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-violet-500/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
      ✓ APP
    </span>
  );
}

function DiscordWelcomeCard() {
  return (
    <div className="relative mx-auto max-w-md">
      <div className="home-float absolute -left-3 top-6 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/15 text-violet-200 shadow-lg">
        <DoorOpen className="h-5 w-5" />
      </div>
      <div className="home-float-delay absolute -right-2 bottom-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-fuchsia-400/30 bg-fuchsia-500/15 text-fuchsia-200 shadow-lg">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="rounded-2xl border border-white/[0.08] bg-[#1e1f24] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
        <div className="mb-4 flex items-center gap-2.5">
          <EyedBotMark className="h-9 w-9 rounded-full" />
          <span className="font-semibold text-white">EyedBot</span>
          <DiscordAppBadge />
        </div>
        <p className="text-base font-semibold text-white">¡Bienvenid@ al servidor!</p>
        <p className="mt-2 text-sm leading-relaxed text-[#b5bac1]">
          Esperamos que disfrutes tu estancia, <span className="font-medium text-violet-300">@usuario</span>. ¡Ya somos{" "}
          <span className="font-medium text-white">1.000</span> miembros!
        </p>
        <p className="mt-3 text-xs text-[#949ba4]">Tarjetas con imagen · variables · fuentes personalizables</p>
      </div>
    </div>
  );
}

function FeatureSection({
  id,
  title,
  paragraphs,
  ctaHref,
  ctaLabel,
  reverse,
  preview,
}: {
  id: string;
  title: string;
  paragraphs: string[];
  ctaHref: string;
  ctaLabel: string;
  reverse?: boolean;
  preview: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/[0.06] py-16 md:py-24">
      <div
        className={cn(
          "mx-auto grid max-w-6xl items-center gap-10 px-4 lg:grid-cols-2 lg:gap-16 lg:px-8",
          reverse && "lg:[&>div:first-child]:order-2 lg:[&>div:last-child]:order-1"
        )}
      >
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">{title}</h2>
          <div className="mt-5 space-y-4 text-base leading-relaxed text-zinc-400">
            {paragraphs.map((p) => (
              <p key={p.slice(0, 32)}>{p}</p>
            ))}
          </div>
          <Link
            href={ctaHref}
            className="mt-8 inline-flex rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-white"
          >
            {ctaLabel}
          </Link>
        </div>
        <div className="relative">{preview}</div>
      </div>
    </section>
  );
}

function HomeHeader({ loggedIn }: { loggedIn: boolean }) {
  const [modulesOpen, setModulesOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#111114]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 lg:px-8">
        <EyedBotLogo href="/" label="EyedBot" showText="desktop" />

        <nav className="hidden items-center gap-1 md:flex">
          <Link href="/commands" className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white">
            Comandos
          </Link>
          <div className="relative">
            <button
              type="button"
              onClick={() => setModulesOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
            >
              Módulos
              <ChevronDown className={cn("h-4 w-4 transition", modulesOpen && "rotate-180")} />
            </button>
            {modulesOpen ? (
              <div className="absolute left-0 top-full z-20 mt-1 min-w-[180px] rounded-xl border border-white/10 bg-[#1a1b1f] p-1.5 shadow-xl">
                {MODULE_LINKS.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setModulesOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
          <Link href="/about" className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white">
            Recursos
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/premium"
            className="hidden items-center gap-1.5 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 sm:inline-flex"
          >
            <Crown className="h-4 w-4" />
            Premium
          </Link>
          {loggedIn ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              <LayoutDashboard className="h-4 w-4" />
              Panel
            </Link>
          ) : (
            <a
              href="/auth/discord"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-[#1e1f24] px-4 py-2 text-sm font-medium text-white transition hover:border-[#5865F2]/50 hover:bg-[#5865F2]/15"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 12.3 12.3 0 0 0-.608 1.25 18.3 18.3 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.08.08 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107 14.322 14.322 0 0 0 1.225 1.993.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              Login
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

function LoginBlock({
  loggedIn,
  errorMessage,
  compact,
}: {
  loggedIn: boolean;
  errorMessage: string | null;
  compact?: boolean;
}) {
  return (
    <div
      id="entrar"
      className={cn(
        "rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.35)]",
        compact && "p-6"
      )}
    >
      <EyedBotMark className="eyedbot-mark-glow mx-auto mb-4 h-14 w-14 rounded-2xl" />
      <h2 className="text-xl font-bold text-white">{loggedIn ? "Bienvenido de nuevo" : "Configura tu servidor"}</h2>
      <p className="mt-2 text-sm text-zinc-400">
        {loggedIn
          ? "Tu sesión está activa. Continúa en el panel."
          : "Inicia sesión con Discord para administrar servidores donde tengas permisos."}
      </p>
      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{errorMessage}</div>
      ) : null}
      {loggedIn ? (
        <Link
          href="/dashboard"
          className="mt-6 inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3 text-sm font-semibold text-white"
        >
          <LayoutDashboard className="h-5 w-5" />
          Abrir panel
        </Link>
      ) : (
        <a
          href="/auth/discord"
          className="mt-6 inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-full bg-[#5865F2] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#4752c4]"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 12.3 12.3 0 0 0-.608 1.25 18.3 18.3 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.08.08 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107 14.322 14.322 0 0 0 1.225 1.993.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
          Continuar con Discord
        </a>
      )}
    </div>
  );
}

export function BotHomePage() {
  const searchParams = useSearchParams();
  const errorKey = searchParams.get("error");
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] || "Ocurrió un error al iniciar sesión." : null;
  const [overview, setOverview] = useState<AboutOverview | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    void getAboutOverview().then(setOverview).catch(() => null);
    void getPanelBootstrap(false)
      .then(() => setLoggedIn(true))
      .catch(() => setLoggedIn(false));
  }, []);

  const botName = overview?.botName || "EyedBot";

  return (
    <div className="min-h-screen bg-[#111114] text-zinc-100">
      <HomeHeader loggedIn={loggedIn} />

      <section className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-violet-600/10 blur-3xl" />
          <div className="absolute right-0 top-20 h-80 w-80 rounded-full bg-fuchsia-600/8 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 py-16 lg:px-8 lg:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-sm font-medium text-violet-300/90">{botName} · bot y panel para Discord</p>
              <h1 className="mt-4 max-w-xl text-4xl font-bold leading-[1.1] tracking-tight text-white md:text-5xl lg:text-6xl">
                Tu comunidad de Discord,{" "}
                <span className="bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
                  mejor organizada
                </span>
              </h1>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-zinc-400">
                {overview?.purpose ||
                  "Interacciones con GIFs de anime, embeds personalizados, bienvenidas con imagen, tickets, niveles y alertas — todo desde el panel web."}
              </p>
              <div className="mt-8 grid max-w-sm grid-cols-2 gap-3">
                {[
                  { label: "Servidores", value: overview?.totalServers ?? "—" },
                  { label: "Comandos", value: overview?.totalCommands ?? "—" },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">{stat.label}</p>
                    <p className="mt-1 text-lg font-semibold text-white">{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>
            <LoginBlock loggedIn={loggedIn} errorMessage={errorMessage} />
          </div>
        </div>
      </section>

      <main>
        <FeatureSection
          id="interacciones"
          title="Interacciones"
          paragraphs={[
            "Comandos de diversión con GIFs de anime: abrazos, palmadas, besos y búsqueda libre con /gif.",
            "Cada interacción lleva contador por usuario y botón para devolver la acción, como en los mejores bots de roleplay.",
          ]}
          ctaHref="/commands"
          ctaLabel="Ver comandos de diversión"
          preview={<InteractionsShowcase />}
        />

        <FeatureSection
          id="bienvenidas"
          title="Bienvenidas"
          reverse
          paragraphs={[
            "EyedBot personaliza mensajes de bienvenida y despedida con embeds o tarjetas con imagen generada al vuelo.",
            "Usa variables como {user}, {username} y {memberCount}, elige fuentes, colores y arrastra los elementos en el editor visual.",
            "Con EyedBot en tu servidor, todos se sentirán bienvenidos desde el primer mensaje.",
          ]}
          ctaHref="#entrar"
          ctaLabel="Aprende más sobre las Bienvenidas"
          preview={<DiscordWelcomeCard />}
        />

        <FeatureSection
          id="panel"
          title="Panel web"
          paragraphs={[
            "Configura cada módulo del servidor desde el navegador: verificación, anti-raid, voz temporal y más.",
            "Sin reiniciar el bot ni tocar archivos. Cambios en tiempo real con vistas previa de Discord.",
            "Diseñado para administradores que quieren control total sin complicaciones.",
          ]}
          ctaHref="/commands"
          ctaLabel="Ver comandos del bot"
          preview={
            <div className="home-float">
              <OverviewShowcase />
            </div>
          }
        />

        <FeatureSection
          id="embeds"
          title="Embeds"
          reverse
          paragraphs={[
            "Crea y publica embeds desde el panel con imágenes, campos, colores y plantillas guardadas.",
            "Vista previa en tiempo real con el estilo exacto de Discord antes de enviar al canal.",
            "Ideal para anuncios, reglas, eventos y mensajes destacados de tu servidor.",
          ]}
          ctaHref="#entrar"
          ctaLabel="Configurar embeds"
          preview={<EmbedShowcase />}
        />

        <FeatureSection
          id="tickets"
          title="Tickets"
          reverse
          paragraphs={[
            "Sistema de soporte con panel publicable, roles de staff, categorías y gestión de tickets activos.",
            "Historial, informes y flujos para tu equipo de moderación.",
            "Todo configurable desde la pestaña Tickets del panel.",
          ]}
          ctaHref="#entrar"
          ctaLabel="Configurar tickets"
          preview={
            <div className="relative">
              <div className="home-float absolute -left-2 top-8 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/20 text-violet-200">
                <Ticket className="h-5 w-5" />
              </div>
              <TicketsShowcase />
            </div>
          }
        />

        <FeatureSection
          id="niveles"
          title="Niveles y economía"
          paragraphs={[
            "XP por mensajes y tiempo en voz, con multiplicadores, recompensas por rol y leaderboard con podio.",
            "Integrado con la economía del gacha: monedas, tienda e inventario por servidor.",
            "Motiva a tu comunidad con progresión visible y recompensas automáticas.",
          ]}
          ctaHref="#entrar"
          ctaLabel="Aprende más sobre Niveles"
          preview={
            <div className="relative">
              <div className="home-float-delay absolute -right-1 bottom-6 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20 text-amber-200">
                <Bolt className="h-5 w-5" />
              </div>
              <LevelingShowcase />
            </div>
          }
        />

        <FeatureSection
          id="alertas"
          title="Alertas"
          reverse
          paragraphs={[
            "Avisos cuando tus creadores empiezan directo en Twitch o YouTube, con WebSub y EventSub.",
            "Sigue series en Crunchyroll y recibe el capítulo nuevo en el canal que elijas.",
            "También juegos gratis de Epic y Steam, todo con embeds listos para publicar.",
          ]}
          ctaHref="#entrar"
          ctaLabel="Configurar alertas"
          preview={
            <div className="relative">
              <div className="home-float absolute -left-2 top-6 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/20 text-violet-200">
                <Bell className="h-5 w-5" />
              </div>
              <div className="home-float-delay absolute -right-1 bottom-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/20 text-orange-200">
                <Tv className="h-5 w-5" />
              </div>
              <AlertsShowcase />
            </div>
          }
        />

        <FeatureSection
          id="eyedplus"
          title="EyedPlus+"
          paragraphs={[
            "Desbloquea personalización avanzada del panel: temas, fondo propio, blur y paleta completa.",
            "Módulos premium como gacha avanzado, plantillas de embeds y más opciones visuales.",
            "Haz que el panel se sienta parte de la identidad de tu servidor.",
          ]}
          ctaHref="/premium"
          ctaLabel="Conocer EyedPlus+"
          preview={
            <div className="relative">
              <div className="home-float absolute -right-2 top-10 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-fuchsia-500/20 text-fuchsia-200">
                <Palette className="h-5 w-5" />
              </div>
              <ThemeShowcase />
            </div>
          }
        />

        <FeatureSection
          id="seguridad"
          title="Seguridad"
          reverse
          paragraphs={[
            "Verificación por reacción o botón, anti-spam, anti-raid y filtros configurables.",
            "Protege tu servidor sin sacrificar la experiencia de los miembros nuevos.",
            "Cada capa se activa y ajusta desde el panel, con pruebas en vivo.",
          ]}
          ctaHref="#entrar"
          ctaLabel="Proteger mi servidor"
          preview={
            <div className="relative mx-auto max-w-md">
              <div className="home-float absolute -left-3 top-8 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/15 text-emerald-200">
                <Shield className="h-5 w-5" />
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-[#1e1f24] p-5 shadow-xl">
                <div className="mb-3 flex items-center gap-2">
                  <EyedBotMark className="h-8 w-8 rounded-full" />
                  <span className="font-semibold text-white">EyedBot</span>
                  <DiscordAppBadge />
                </div>
                <p className="text-sm font-semibold text-emerald-300">Protección del servidor</p>
                <p className="mt-2 text-sm text-[#b5bac1]">
                  Anti-raid activo · Verificación en #registro · Filtros de enlaces configurados.
                </p>
              </div>
            </div>
          }
        />
      </main>

      <section className="border-t border-white/[0.06] bg-white/[0.02] py-16">
        <div className="mx-auto max-w-lg px-4">
          <LoginBlock loggedIn={loggedIn} errorMessage={errorMessage} compact />
        </div>
      </section>

      <footer className="border-t border-white/[0.06] py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-sm text-zinc-500 lg:px-8">
          <EyedBotLogo href="/" label={botName} showText={false} markClassName="h-8 w-8" />
          <div className="flex flex-wrap gap-4">
            <Link href="/about" className="hover:text-zinc-300">
              Acerca de
            </Link>
            <Link href="/commands" className="hover:text-zinc-300">
              Comandos
            </Link>
            <Link href="/premium" className="hover:text-zinc-300">
              EyedPlus+
            </Link>
            <a href="https://discord.gg/eN6eQdGn87" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300">
              Soporte
            </a>
          </div>
          <p>© {new Date().getFullYear()} {botName}</p>
        </div>
      </footer>
    </div>
  );
}
