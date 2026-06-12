"use client";

import { useEffect, useState } from "react";
import { DoorOpen, PartyPopper } from "lucide-react";
import {
  getGoodbyeConfig,
  getWelcomeConfig,
  saveGoodbyeConfig,
  saveWelcomeConfig,
  testGoodbye,
  testWelcome,
} from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Tabs } from "@/components/ui/Tabs";
import { Switch } from "@/components/ui/Switch";
import {
  ChannelSelect,
  Field,
  FormActions,
  Input,
  PaneGrid,
  SectionCard,
  Textarea,
} from "@/components/features/shared";
import { asRecord, getErrorMessage, toBooleanValue, toStringValue } from "@/lib/utils";

type ConfigState = {
  enabled: boolean;
  channelId: string;
  message: string;
  imageUrl: string;
};

const defaultState: ConfigState = {
  enabled: false,
  channelId: "",
  message: "",
  imageUrl: "",
};

function normalizeConfig(value: unknown): ConfigState {
  const data = asRecord(value);
  return {
    enabled: toBooleanValue(data.enabled),
    channelId: toStringValue(data.channelId || data.channel_id),
    message: toStringValue(data.message || data.content),
    imageUrl: toStringValue(data.imageUrl || data.image_url),
  };
}

export function WelcomePane({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { toast } = useToast();
  const [tab, setTab] = useState("welcome");
  const [sectionTab, setSectionTab] = useState("general");
  const [welcome, setWelcome] = useState<ConfigState>(defaultState);
  const [goodbye, setGoodbye] = useState<ConfigState>(defaultState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getWelcomeConfig(guildId), getGoodbyeConfig(guildId)])
      .then(([welcomeData, goodbyeData]) => {
        if (!active) return;
        setWelcome(normalizeConfig(welcomeData));
        setGoodbye(normalizeConfig(goodbyeData));
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

  const active = tab === "welcome" ? welcome : goodbye;
  const setActive = tab === "welcome" ? setWelcome : setGoodbye;

  async function handleSave() {
    setSaving(true);
    try {
      if (tab === "welcome") {
        await saveWelcomeConfig(guildId, active);
      } else {
        await saveGoodbyeConfig(guildId, active);
      }
      toast({ title: "Configuración guardada", description: "Los cambios se aplicaron correctamente.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      if (tab === "welcome") {
        await testWelcome(guildId);
      } else {
        await testGoodbye(guildId);
      }
      toast({ title: "Prueba enviada", description: "Revisa el canal configurado en Discord.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo probar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <Alert title="Cargando mensajes automáticos" description="Estamos consultando las configuraciones de bienvenida y despedida." />;
  }

  if (error) {
    return <Alert title="No se pudo cargar el módulo" description={error} variant="danger" />;
  }

  return (
    <PaneGrid>
      <SectionCard
        title="Flujos de entrada y salida"
        description="Personaliza mensajes de bienvenida y despedida con un tono consistente."
        action={
          <Tabs
            items={[
              { id: "welcome", label: "Bienvenida" },
              { id: "goodbye", label: "Despedida" },
            ]}
            value={tab}
            onValueChange={(value) => {
              setTab(value);
              setSectionTab("general");
            }}
          />
        }
      >
        <Tabs
          items={[
            { id: "general", label: "General" },
            { id: "message", label: "Mensaje" },
            { id: "media", label: "Imágenes" },
            { id: "dm", label: "DM" },
          ]}
          value={sectionTab}
          onValueChange={setSectionTab}
          className="mb-5"
        />

        <div className="space-y-5">
          {sectionTab === "general" ? (
            <>
              <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                <div>
                  <p className="font-medium text-white">Activar {tab === "welcome" ? "bienvenida" : "despedida"}</p>
                  <p className="text-sm text-zinc-400">Envía mensajes automáticos al canal seleccionado.</p>
                </div>
                <Switch checked={active.enabled} onCheckedChange={(checked) => setActive((current) => ({ ...current, enabled: checked }))} />
              </div>
              <Field label="Canal" description="Destino donde se publicará el mensaje del evento.">
                <ChannelSelect value={active.channelId} onChange={(channelId) => setActive((current) => ({ ...current, channelId }))} options={channels} />
              </Field>
            </>
          ) : null}

          {sectionTab === "message" ? (
            <Field label="Mensaje" description="Puedes usar variables si el backend las soporta.">
              <Textarea
                value={active.message}
                onChange={(event) => setActive((current) => ({ ...current, message: event.target.value }))}
                placeholder="Ej. Bienvenido {user} a {server}"
              />
            </Field>
          ) : null}

          {sectionTab === "media" ? (
            <Field label="Imagen o fondo" description="URL opcional para reforzar el aspecto visual del mensaje.">
              <Input
                value={active.imageUrl}
                onChange={(event) => setActive((current) => ({ ...current, imageUrl: event.target.value }))}
                placeholder="https://..."
              />
            </Field>
          ) : null}

          {sectionTab === "dm" ? (
            <Alert title="Mensaje privado" description="El envío por DM del panel legacy se migrará en la siguiente iteración. Por ahora configura canal + mensaje." />
          ) : null}

          <FormActions onSave={handleSave} onTest={handleTest} saving={saving} testing={testing} />
        </div>
      </SectionCard>

      <SectionCard
        title={tab === "welcome" ? "Vista narrativa" : "Mensaje de salida"}
        description="Resumen rápido del tono y entrega actual."
      >
        <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.28),_rgba(0,0,0,0.12)_55%)] p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white">
            {tab === "welcome" ? <PartyPopper className="h-6 w-6" /> : <DoorOpen className="h-6 w-6" />}
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
            {active.enabled ? "Activo" : "Inactivo"}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-100">
            {active.message || "Aun no hay un mensaje configurado para esta pestaña."}
          </p>
          <p className="mt-4 text-sm text-zinc-400">
            Canal: {channels.find((channel) => channel.id === active.channelId)?.name || "Sin canal"}
          </p>
        </div>
      </SectionCard>
    </PaneGrid>
  );
}
