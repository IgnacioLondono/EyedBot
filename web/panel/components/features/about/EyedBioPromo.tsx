import { ExternalLink, Link2, Music2, Palette, Sparkles } from "lucide-react";

const EYEDBIO_URL = "https://eyedbio.eyedcomun.me/";

type EyedBioPromoProps = {
  variant?: "card" | "banner";
};

export function EyedBioPromo({ variant = "card" }: EyedBioPromoProps) {
  if (variant === "banner") {
    return (
      <div className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-violet-500/5 to-fuchsia-500/10 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300/80">Del ecosistema EyedComun</p>
            <h3 className="mt-1 text-lg font-semibold text-white">Eyed.bio — tu tarjeta link-in-bio</h3>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              Crea una página con tus redes, música de fondo, fondos animados y efectos visuales. Ideal para compartir
              en Discord, Instagram o tu bio.
            </p>
          </div>
          <a
            href={EYEDBIO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-4 py-2.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/25"
          >
            Crear mi perfil
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
      <div className="border-b border-white/8 bg-gradient-to-r from-cyan-500/10 via-violet-500/10 to-fuchsia-500/10 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300/80">EyedComun</p>
            <h3 className="mt-1 text-xl font-semibold text-white">Eyed.bio</h3>
            <p className="mt-1 text-sm text-zinc-400">Tu página link-in-bio moderna y personalizable.</p>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-500/15 text-cyan-200">
            <Link2 className="h-5 w-5" />
          </span>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <p className="text-sm text-zinc-300">
          Reúne Discord, Instagram, YouTube y más en una sola tarjeta. Añade música, fondos animados, efectos visuales
          y miles de combinaciones de estilo — gratis y sin anuncios.
        </p>

        <ul className="grid gap-2 sm:grid-cols-3">
          <li className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">
            <Link2 className="h-3.5 w-3.5 shrink-0 text-violet-300" />
            Redes y enlaces
          </li>
          <li className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">
            <Music2 className="h-3.5 w-3.5 shrink-0 text-fuchsia-300" />
            Música de fondo
          </li>
          <li className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">
            <Palette className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
            Fondos y efectos
          </li>
        </ul>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href={EYEDBIO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-violet-600 px-4 py-2 text-sm font-medium text-white"
          >
            <Sparkles className="h-4 w-4" />
            Ir a Eyed.bio
            <ExternalLink className="h-3.5 w-3.5 opacity-80" />
          </a>
          <span className="text-xs text-zinc-500">eyedbio.eyedcomun.me</span>
        </div>
      </div>
    </div>
  );
}

export { EYEDBIO_URL };
