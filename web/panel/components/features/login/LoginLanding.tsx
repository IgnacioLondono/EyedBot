"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Bolt,
  Eye,
  LayoutDashboard,
  Palette,
  Shield,
  Sparkles,
  Ticket,
  Terminal,
  Zap,
} from "lucide-react";
import { OverviewShowcase } from "@/components/features/about/AboutShowcases";

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: "Panel web moderno",
    desc: "Configura cada servidor desde el navegador sin tocar código ni reiniciar el bot.",
  },
  {
    icon: Ticket,
    title: "Tickets y soporte",
    desc: "Panel de solicitudes, roles de staff, gestión activa e historial de conversaciones.",
  },
  {
    icon: Bolt,
    title: "Niveles y actividad",
    desc: "XP, recompensas por rol, leaderboards con podio y estadísticas en tiempo real.",
  },
  {
    icon: Shield,
    title: "Seguridad",
    desc: "Verificación, anti-spam, anti-raid y filtros para proteger tu comunidad.",
  },
  {
    icon: Bell,
    title: "Alertas de directos",
    desc: "Avisos automáticos cuando tus creadores favoritos empiezan stream.",
  },
  {
    icon: Palette,
    title: "Personalización EyedPlus+",
    desc: "Temas, fondo propio, blur configurable y paleta completa del panel.",
  },
];

const STEPS = [
  "Inicia sesión con tu cuenta de Discord.",
  "Elige el servidor que administras.",
  "Configura módulos como bienvenida, tickets o niveles.",
  "Publica embeds y ajusta todo desde el panel.",
];

const ERROR_MESSAGES: Record<string, string> = {
  discord_error: "Discord rechazó la autorización. Inténtalo de nuevo.",
  session_error: "No se pudo crear la sesión. Vuelve a iniciar sesión.",
  no_code: "Faltó el código de autorización. Repite el proceso.",
  config_error: "Error de configuración del servidor. Contacta al administrador.",
  auth_failed: "No se pudo completar el inicio de sesión.",
  invalid_secret: "Credenciales OAuth inválidas en el servidor.",
};

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

function RotatingHighlight() {
  const highlights = [
    "Gestiona tickets sin salir del panel",
    "Embeds con autor, campos e imágenes",
    "Resumen con gráficos y drill-down",
    "Comandos organizados por categoría",
  ];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % highlights.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="mt-4 h-6 overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.p
          key={highlights[index]}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.35 }}
          className="text-sm text-violet-200/90"
        >
          {highlights[index]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

export function LoginLanding() {
  const searchParams = useSearchParams();
  const errorKey = searchParams.get("error");
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] || "Ocurrió un error al iniciar sesión." : null;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#07060d] text-zinc-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <motion.div
          className="absolute -left-24 top-20 h-80 w-80 rounded-full bg-violet-600/25 blur-3xl"
          animate={{ x: [0, 40, 0], y: [0, 24, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute right-0 top-1/3 h-96 w-96 rounded-full bg-fuchsia-500/15 blur-3xl"
          animate={{ x: [0, -30, 0], y: [0, -20, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl"
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-8 lg:px-8 lg:py-12">
        <motion.header
          {...fadeUp}
          transition={{ duration: 0.5 }}
          className="mb-10 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-violet-500/20 text-violet-100 shadow-[0_0_40px_rgba(139,92,246,0.35)]">
              <Eye className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-white">EyedBot</p>
              <p className="text-xs text-zinc-500">Panel de administración</p>
            </div>
          </div>
          <a
            href="https://discord.gg/eN6eQdGn87"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 sm:inline-flex"
          >
            Servidor de soporte
          </a>
        </motion.header>

        <div className="grid flex-1 items-start gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
          <div className="space-y-10">
            <motion.section {...fadeUp} transition={{ duration: 0.55, delay: 0.05 }}>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-300/80">Tu comunidad, bajo control</p>
              <h1 className="mt-3 max-w-2xl text-4xl font-bold leading-tight text-white sm:text-5xl">
                El bot de Discord con panel web para{" "}
                <span className="bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
                  moderar, automatizar y crecer
                </span>
              </h1>
              <p className="mt-4 max-w-xl text-lg text-zinc-400">
                Bienvenidas, verificación, tickets, niveles, alertas de directos, seguridad, gacha y más — todo
                configurable desde un solo lugar.
              </p>
              <RotatingHighlight />
            </motion.section>

            <motion.section
              initial="initial"
              animate="animate"
              variants={{
                animate: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
              }}
              className="grid gap-3 sm:grid-cols-2"
            >
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <motion.article
                    key={feature.title}
                    variants={fadeUp}
                    transition={{ duration: 0.45 }}
                    whileHover={{ y: -4, transition: { duration: 0.2 } }}
                    className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 backdrop-blur-sm"
                  >
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h2 className="font-medium text-white">{feature.title}</h2>
                    <p className="mt-1 text-sm text-zinc-400">{feature.desc}</p>
                  </motion.article>
                );
              })}
            </motion.section>

            <motion.section
              {...fadeUp}
              transition={{ duration: 0.55, delay: 0.25 }}
              className="grid gap-6 lg:grid-cols-2"
            >
              <div className="rounded-3xl border border-white/8 bg-black/20 p-5">
                <div className="mb-4 flex items-center gap-2 text-sm font-medium text-white">
                  <Zap className="h-4 w-4 text-amber-300" />
                  Cómo empezar
                </div>
                <ol className="space-y-3">
                  {STEPS.map((step, index) => (
                    <li key={step} className="flex gap-3 text-sm text-zinc-300">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600/25 text-xs font-semibold text-violet-200">
                        {index + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-zinc-400">Vista previa del panel</p>
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.35 }}
                >
                  <OverviewShowcase />
                </motion.div>
              </div>
            </motion.section>

            <motion.div
              {...fadeUp}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-wrap gap-3 text-sm text-zinc-500"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 px-3 py-1">
                <Terminal className="h-3.5 w-3.5" />
                Comandos slash
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 px-3 py-1">
                <Sparkles className="h-3.5 w-3.5 text-fuchsia-300" />
                EyedPlus+ premium
              </span>
            </motion.div>
          </div>

          <motion.aside
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="lg:sticky lg:top-10"
          >
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600/40 to-fuchsia-600/30 text-violet-100">
                <Eye className="h-8 w-8" />
              </div>
              <h2 className="text-center text-2xl font-bold text-white">Entrar al panel</h2>
              <p className="mt-2 text-center text-sm text-zinc-400">
                Usa tu cuenta de Discord. Solo verás servidores donde tengas permisos de administración.
              </p>

              {errorMessage ? (
                <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {errorMessage}
                </div>
              ) : null}

              <a
                href="/auth/discord"
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#4752c4]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037 12.3 12.3 0 0 0-.608 1.25 18.3 18.3 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.08.08 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107 14.322 14.322 0 0 0 1.225 1.993.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                Continuar con Discord
              </a>

              <p className="mt-5 text-center text-xs text-zinc-500">
                Al continuar aceptas que EyedBot acceda a tu perfil y lista de servidores para el panel.
              </p>

              <div className="mt-6 space-y-2 border-t border-white/8 pt-6 text-sm">
                <Link href="/about" className="flex items-center justify-between rounded-xl px-3 py-2 text-zinc-300 hover:bg-white/5">
                  Conoce el proyecto
                  <span className="text-zinc-500">→</span>
                </Link>
                <Link href="/commands" className="flex items-center justify-between rounded-xl px-3 py-2 text-zinc-300 hover:bg-white/5">
                  Ver comandos
                  <span className="text-zinc-500">→</span>
                </Link>
              </div>
            </div>
          </motion.aside>
        </div>
      </div>
    </div>
  );
}
