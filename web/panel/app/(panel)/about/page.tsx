"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getAboutOverview } from "@/lib/api/endpoints";
import type { AboutOverview } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";

const TABS = [
  { id: "what", title: "Qué es EyedBot", body: "Bot de Discord para moderar, automatizar y hacer crecer tu comunidad desde un solo panel." },
  { id: "purpose", title: "Propósito", body: "Dar a administradores una base moderna para cuidar su servidor sin configuraciones dispersas." },
  { id: "panel", title: "Panel web", body: "Configura bienvenidas, tickets, niveles, alertas y más desde el navegador." },
];

export default function AboutPage() {
  const [overview, setOverview] = useState<AboutOverview | null>(null);
  const [tab, setTab] = useState("what");

  useEffect(() => {
    void getAboutOverview().then(setOverview).catch(() => null);
  }, []);

  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <>
      <PageHeader
        kicker="Acerca de"
        title="Conoce el proyecto"
        description="Explora qué es EyedBot, para qué fue creado y cómo evoluciona el servicio."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
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
        <Card>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Estado</p>
          <p className="mt-2 text-3xl font-bold text-emerald-300">Activo</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-xl px-4 py-2 text-sm ${
              tab === item.id ? "bg-violet-600 text-white" : "bg-white/5 text-zinc-400"
            }`}
          >
            {item.title}
          </button>
        ))}
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-6"
      >
        <Card>
          <h2 className="text-xl font-semibold text-white">{active.title}</h2>
          <p className="mt-3 text-zinc-300">{active.body}</p>
        </Card>
      </motion.div>
    </>
  );
}
