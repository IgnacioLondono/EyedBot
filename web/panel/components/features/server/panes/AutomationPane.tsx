"use client";

import { useEffect, useState } from "react";
import { applyChannelSetup, getChannelSetup } from "@/lib/api/endpoints";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Field, Input, PaneGrid, SectionCard, Textarea } from "@/components/features/shared";
import { asRecord, getErrorMessage, toStringValue } from "@/lib/utils";

const AUTOMATION_TABS = [
  { id: "config", label: "Configuración" },
  { id: "rules", label: "Plantillas" },
  { id: "guide", label: "Guía" },
];

type SetupState = {
  categoryName: string;
  channels: string;
};

export function AutomationPane({ guildId }: { guildId: string }) {
  const { toast } = useToast();
  const [tab, setTab] = useState("config");
  const [setup, setSetup] = useState<SetupState>({ categoryName: "", channels: "" });
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getChannelSetup(guildId)
      .then((setupData) => {
        if (!active) return;
        const normalizedSetup = asRecord(setupData);
        setSetup({
          categoryName: toStringValue(normalizedSetup.categoryName || normalizedSetup.name),
          channels: Array.isArray(normalizedSetup.channels)
            ? normalizedSetup.channels.map((item) => toStringValue(asRecord(item).name || item)).join("\n")
            : toStringValue(normalizedSetup.channels),
        });
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [guildId]);

  async function applySetup() {
    setApplying(true);
    try {
      await applyChannelSetup(guildId, {
        categoryName: setup.categoryName,
        channels: setup.channels
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
      });
      toast({ title: "Setup enviado", description: "La creación de canales fue solicitada.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo aplicar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setApplying(false);
    }
  }

  if (loading) return <Alert title="Cargando automatización" description="Consultando plantillas de canales." />;
  if (error) return <Alert title="No se pudo cargar automatización" description={error} variant="danger" />;

  return (
    <SectionCard title="Automatización" description="Plantillas y creación rápida de estructura del servidor.">
      <Tabs items={AUTOMATION_TABS} value={tab} onValueChange={setTab} className="mb-6" />

      {tab === "config" ? (
        <PaneGrid>
          <div className="space-y-5">
            <Field label="Nombre de la categoría principal">
              <Input value={setup.categoryName} onChange={(event) => setSetup((c) => ({ ...c, categoryName: event.target.value }))} />
            </Field>
            <Field label="Canales a crear" description="Escribe un canal por línea.">
              <Textarea value={setup.channels} onChange={(event) => setSetup((c) => ({ ...c, channels: event.target.value }))} />
            </Field>
            <Button onClick={() => void applySetup()} disabled={applying}>
              {applying ? "Aplicando..." : "Crear estructura"}
            </Button>
          </div>
          <Alert title="Canal setup" description="Equivalente a la pestaña channelsetup del panel anterior." />
        </PaneGrid>
      ) : null}

      {tab === "rules" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[
            { name: "Moderación", channels: "reglas\navisos-staff\nlogs" },
            { name: "Comunidad", channels: "general\noff-topic\nmedia" },
            { name: "Soporte", channels: "ayuda\nreportes\nsugerencias" },
          ].map((template) => (
            <button
              key={template.name}
              type="button"
              onClick={() =>
                setSetup({
                  categoryName: template.name,
                  channels: template.channels.replace(/\\n/g, "\n"),
                })
              }
              className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-500/40"
            >
              <p className="font-medium text-white">{template.name}</p>
              <p className="mt-2 text-sm text-zinc-400">{template.channels.replace(/\\n/g, ", ")}</p>
            </button>
          ))}
        </div>
      ) : null}

      {tab === "guide" ? (
        <Alert
          title="Cómo usar automatización"
          description="Define una categoría y lista de canales, pulsa Crear estructura y el bot generará la base. Anti-raid y seguridad avanzada están en el módulo Seguridad."
        />
      ) : null}
    </SectionCard>
  );
}
