"use client";

import { useEffect, useState } from "react";
import { DiscordEmbedShell, DiscordEmbedPreview } from "@/components/features/embed/EmbedPreview";
import { SHOWCASE_ANIME_GIFS, SHOWCASE_INTERACTIONS } from "@/lib/showcase-media";
import { SERVER_PANES } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function MockFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c0a14] shadow-2xl">
      <div className="flex items-center gap-2 border-b border-white/8 bg-black/40 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        <span className="ml-2 truncate text-xs text-zinc-500">{title}</span>
      </div>
      {children}
    </div>
  );
}

function ShowcasePanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-white/10 bg-[#1e1f24] p-4 shadow-xl", className)}>{children}</div>
  );
}

function ShowcaseAnimeGif({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn("w-full rounded-lg object-cover", className)}
    />
  );
}

export function DashboardShowcase() {
  return (
    <MockFrame title="eyedcomun.me/dashboard">
      <div className="p-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Favoritos</p>
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-500/30" />
            <div>
              <p className="text-sm font-medium text-white">EyedComun</p>
              <p className="text-xs text-zinc-500">41 miembros · Bienvenida · Tickets</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <span className="rounded-lg bg-white/8 py-1.5 text-center text-xs text-white">Resumen</span>
            <span className="rounded-lg border border-white/10 py-1.5 text-center text-xs text-zinc-300">Configurar</span>
          </div>
        </div>
      </div>
    </MockFrame>
  );
}

export function OverviewShowcase() {
  return (
    <MockFrame title="Servidor · Resumen">
      <div className="flex gap-3 p-3">
        <div className="hidden w-24 shrink-0 space-y-1 sm:block">
          {SERVER_PANES.slice(0, 6).map((pane, index) => (
            <div
              key={pane.id}
              className={`rounded-lg px-2 py-1 text-[10px] ${index === 0 ? "bg-[color:var(--color-accent)]/30 text-white" : "text-zinc-500"}`}
            >
              {pane.label}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {["Miembros", "Canales", "Roles", "Actividad"].map((label) => (
              <div key={label} className="rounded-xl border border-white/8 bg-black/30 p-2">
                <p className="text-[10px] text-zinc-500">{label}</p>
                <p className="text-sm font-semibold text-white">—</p>
              </div>
            ))}
          </div>
          <div className="h-16 rounded-xl border border-white/8 bg-gradient-to-r from-[#a78bfa]/10 to-[#c4b5fd]/10" />
        </div>
      </div>
    </MockFrame>
  );
}

export function TicketsShowcase() {
  return (
    <MockFrame title="Tickets · Panel y gestión">
      <div className="grid gap-3 p-4 md:grid-cols-2">
        <DiscordEmbedShell color="#8b5cf6" className="rounded-xl">
          <div className="p-3">
            <p className="text-sm font-semibold text-white">Soporte</p>
            <p className="mt-1 text-xs text-[#dcddde]">Abre un ticket con el botón de abajo.</p>
            <span className="mt-3 inline-flex rounded-lg bg-[#5865f2] px-3 py-1.5 text-xs text-white">Solicitar ticket</span>
          </div>
        </DiscordEmbedShell>
        <div className="space-y-2 rounded-xl border border-white/8 bg-black/30 p-3">
          <p className="text-xs font-medium text-white">Roles de staff</p>
          {["Moderador", "Soporte", "Admin"].map((role) => (
            <label key={role} className="flex items-center gap-2 text-xs text-zinc-300">
              <span className="h-3 w-3 rounded border border-violet-400 bg-violet-500/40" />
              {role}
            </label>
          ))}
        </div>
      </div>
    </MockFrame>
  );
}

export function ThemeShowcase() {
  return (
    <MockFrame title="Personalización · Tema y fondo">
      <div className="p-4">
        <div className="mb-3 grid grid-cols-4 gap-2">
          {["#a78bfa", "#39d98a", "#ff8a4c", "#4aa3ff"].map((color) => (
            <div key={color} className="h-8 rounded-lg border border-white/10" style={{ background: color }} />
          ))}
        </div>
        <div className="rounded-xl border border-white/8 bg-black/30 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300">Desenfoque del fondo</span>
            <span className="rounded-full bg-zinc-600 px-2 py-0.5 text-[10px] text-white">OFF</span>
          </div>
          <div className="mt-2 h-14 overflow-hidden rounded-lg border border-white/10">
            <div className="h-full w-full bg-gradient-to-br from-[#7c3aed] via-[#a78bfa] to-[#c4b5fd]" />
          </div>
          <p className="mt-2 text-[10px] text-zinc-500">Fondo nítido con velo ajustable</p>
        </div>
      </div>
    </MockFrame>
  );
}

export function WelcomeShowcase() {
  return (
    <MockFrame title="Bienvenida · Embed en Discord">
      <div className="p-4">
        <DiscordEmbedShell color="#34d399" className="rounded-xl">
          <div className="p-3">
            <p className="text-sm font-semibold text-white">¡Bienvenido a EyedComun!</p>
            <p className="mt-1 text-xs text-[#dcddde]">Hola @usuario, ya formas parte de la comunidad.</p>
            <p className="mt-2 text-[10px] text-[#949ba4]">EyedBot · 41 miembros</p>
          </div>
        </DiscordEmbedShell>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-zinc-500">
          <span className="rounded-lg border border-white/8 px-2 py-1">Canal: #bienvenida</span>
          <span className="rounded-lg border border-white/8 px-2 py-1">Color picker</span>
        </div>
      </div>
    </MockFrame>
  );
}

export function EmbedShowcase() {
  return (
    <ShowcasePanel>
      <div className="grid gap-4 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:items-start">
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-400">Constructor en el panel</p>
          {["Título y descripción", "Autor · Campos · Footer", "Imagen / miniatura"].map((label) => (
            <div key={label} className="rounded-xl border border-white/8 bg-[#2b2d31] px-3 py-2 text-xs text-zinc-300">
              {label}
            </div>
          ))}
        </div>
        <DiscordEmbedPreview
          title="Anuncio del evento"
          description="Contenido del embed con campos inline y banner personalizado."
          color="#d946ef"
          imageUrl={SHOWCASE_ANIME_GIFS.pat}
          fields={[
            { name: "Fecha", value: "Sábado 20:00", inline: true },
            { name: "Canal", value: "#anuncios", inline: true },
          ]}
          footer="EyedBot · Constructor de embeds"
        />
      </div>
    </ShowcasePanel>
  );
}

export function LevelingShowcase() {
  return (
    <MockFrame title="Niveles · Leaderboard">
      <div className="p-4">
        <div className="flex items-end justify-center gap-2">
          {[
            { rank: 2, name: "Kiddis", xp: "12.4k", h: "h-16" },
            { rank: 1, name: "Usuario", xp: "18.2k", h: "h-24" },
            { rank: 3, name: "Miembro", xp: "9.1k", h: "h-12" },
          ].map((row) => (
            <div key={row.rank} className={`flex w-20 flex-col items-center rounded-t-xl border border-white/10 bg-violet-500/10 ${row.h} justify-end pb-2`}>
              <span className="text-lg">{row.rank === 1 ? "👑" : row.rank}</span>
              <p className="mt-1 truncate px-1 text-[10px] font-medium text-white">{row.name}</p>
              <p className="text-[9px] text-violet-200">{row.xp}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-[10px] text-zinc-500">XP por mensajes y voz · recompensas por rol</p>
      </div>
    </MockFrame>
  );
}

export function AlertsShowcase() {
  return (
    <MockFrame title="Alertas · Directos y anime">
      <div className="space-y-2 p-4">
        <DiscordEmbedShell color="#9146ff" className="rounded-xl">
          <div className="p-3">
            <p className="text-xs font-semibold text-[#b9bbbe]">🔴 EN DIRECTO</p>
            <p className="mt-1 text-sm font-semibold text-white">Creador está en Twitch</p>
            <p className="mt-1 text-xs text-[#dcddde]">Únete a la transmisión ahora.</p>
          </div>
        </DiscordEmbedShell>
        <DiscordEmbedShell color="#f47521" className="rounded-xl">
          <div className="p-3">
            <p className="text-xs font-semibold text-[#b9bbbe]">📺 Crunchyroll</p>
            <p className="mt-1 text-sm font-semibold text-white">Nuevo episodio disponible</p>
            <p className="mt-1 text-xs text-[#dcddde]">Tu serie seguida acaba de actualizarse.</p>
          </div>
        </DiscordEmbedShell>
      </div>
    </MockFrame>
  );
}

export function InteractionsShowcase() {
  const [index, setIndex] = useState(0);
  const example = SHOWCASE_INTERACTIONS[index] ?? SHOWCASE_INTERACTIONS[0];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % SHOWCASE_INTERACTIONS.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <ShowcasePanel>
      <div className="mb-3 flex items-center justify-center gap-2">
        {SHOWCASE_INTERACTIONS.map((item, itemIndex) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setIndex(itemIndex)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[10px] font-medium transition",
              itemIndex === index
                ? "bg-violet-500/25 text-violet-200"
                : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
            )}
          >
            {item.command}
          </button>
        ))}
      </div>
      <div
        key={example.key}
        className="animate-in fade-in duration-500"
      >
        <DiscordEmbedShell color="#a78bfa" className="rounded-xl">
          <div className="p-3">
            <p className="text-sm font-semibold text-white">{example.title}</p>
            <p className="mt-1 text-xs text-[#dcddde]">
              <span className="font-medium text-violet-300">@Kiddis</span> {example.verb} a{" "}
              <span className="font-medium text-violet-300">@amigo</span>
            </p>
            <ShowcaseAnimeGif
              src={example.gif}
              alt={`GIF de ${example.command}`}
              className="mt-3 max-h-44"
            />
            <p className="mt-2 text-[10px] text-fuchsia-300/90">
              {example.countLabel}: {example.count}
            </p>
          </div>
        </DiscordEmbedShell>
      </div>
      <p className="mt-3 text-center text-[10px] text-zinc-500">/gif · botón de devolver · contador por usuario</p>
    </ShowcasePanel>
  );
}
