"use client";

import { Cpu, Globe2, Palette } from "lucide-react";
import { SectionCard } from "@/components/features/shared";

export function WebSettings() {
  return (
    <SectionCard title="Sistema del panel" description="Información local del entorno y estilo del frontend actual.">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8 text-white">
            <Globe2 className="h-5 w-5" />
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Framework</p>
          <p className="mt-2 text-lg font-semibold text-white">Next.js 16</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8 text-white">
            <Palette className="h-5 w-5" />
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Tema</p>
          <p className="mt-2 text-lg font-semibold text-white">Glass morphism violeta</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8 text-white">
            <Cpu className="h-5 w-5" />
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Render</p>
          <p className="mt-2 text-lg font-semibold text-white">App Router</p>
        </div>
      </div>
    </SectionCard>
  );
}
