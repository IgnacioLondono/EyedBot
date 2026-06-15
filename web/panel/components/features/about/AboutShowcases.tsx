"use client";

import { SERVER_PANES } from "@/lib/navigation";

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
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#2f3136]">
          <div className="h-1 bg-violet-500" />
          <div className="p-3">
            <p className="text-sm font-semibold text-white">Soporte</p>
            <p className="mt-1 text-xs text-[#dcddde]">Abre un ticket con el botón de abajo.</p>
            <span className="mt-3 inline-flex rounded-lg bg-[#5865f2] px-3 py-1.5 text-xs text-white">Solicitar ticket</span>
          </div>
        </div>
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
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#2f3136]">
          <div className="h-1 bg-emerald-400" />
          <div className="p-3">
            <p className="text-sm font-semibold text-white">¡Bienvenido a EyedComun!</p>
            <p className="mt-1 text-xs text-[#dcddde]">Hola @usuario, ya formas parte de la comunidad.</p>
            <p className="mt-2 text-[10px] text-[#949ba4]">EyedBot · 41 miembros</p>
          </div>
        </div>
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
    <MockFrame title="Embeds · Constructor completo">
      <div className="grid gap-3 p-4 md:grid-cols-2">
        <div className="space-y-2 text-xs">
          <div className="rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-zinc-300">Título y descripción</div>
          <div className="rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-zinc-300">Autor · Campos · Footer</div>
          <div className="rounded-lg border border-white/8 bg-black/30 px-2 py-1.5 text-zinc-300">Imagen / miniatura</div>
        </div>
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#2f3136]">
          <div className="h-1 bg-fuchsia-500" />
          <div className="p-3">
            <p className="text-sm font-semibold text-white">Anuncio</p>
            <p className="mt-1 text-xs text-[#dcddde]">Contenido del embed con campos inline.</p>
          </div>
        </div>
      </div>
    </MockFrame>
  );
}
