"use client";

import { useEffect, useState } from "react";
import { DoorOpen, Mail, PartyPopper } from "lucide-react";
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
  mentionUser: boolean;
  title: string;
  message: string;
  color: string;
  footer: string;
  imageUrl: string;
  thumbnailMode: string;
  thumbnailUrl: string;
  dmEnabled: boolean;
  dmMessage: string;
};

const defaultState: ConfigState = {
  enabled: false,
  channelId: "",
  mentionUser: false,
  title: "",
  message: "",
  color: "7c4dff",
  footer: "",
  imageUrl: "",
  thumbnailMode: "avatar",
  thumbnailUrl: "",
  dmEnabled: false,
  dmMessage: "",
};

function normalizeConfig(value: unknown, mode: "welcome" | "goodbye"): ConfigState {
  const data = asRecord(value);
  return {
    enabled: toBooleanValue(data.enabled),
    channelId: toStringValue(data.channelId || data.channel_id),
    mentionUser: toBooleanValue(data.mentionUser),
    title: toStringValue(data.title, mode === "goodbye" ? "Hasta pronto" : "¡Bienvenido!"),
    message: toStringValue(data.message || data.content),
    color: toStringValue(data.color, mode === "goodbye" ? "ff5f9e" : "7c4dff").replace("#", ""),
    footer: toStringValue(data.footer),
    imageUrl: toStringValue(data.imageUrl || data.image_url),
    thumbnailMode: toStringValue(data.thumbnailMode, "avatar"),
    thumbnailUrl: toStringValue(data.thumbnailUrl),
    dmEnabled: toBooleanValue(data.dmEnabled),
    dmMessage: toStringValue(
      data.dmMessage,
      mode === "welcome" ? "Bienvenido a {server}, {username}." : ""
    ),
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
        setWelcome(normalizeConfig(welcomeData, "welcome"));
        setGoodbye(normalizeConfig(goodbyeData, "goodbye"));
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
                <Switch
                  checked={active.enabled}
                  onCheckedChange={(checked) => setActive((current) => ({ ...current, enabled: checked }))}
                />
              </div>
              <Field label="Canal" description="Destino donde se publicará el mensaje del evento.">
                <ChannelSelect
                  value={active.channelId}
                  onChange={(channelId) => setActive((current) => ({ ...current, channelId }))}
                  options={channels}
                />
              </Field>
              <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                <div>
                  <p className="font-medium text-white">Mencionar usuario</p>
                  <p className="text-sm text-zinc-400">Incluye una mención al miembro en el mensaje.</p>
                </div>
                <Switch
                  checked={active.mentionUser}
                  onCheckedChange={(checked) => setActive((current) => ({ ...current, mentionUser: checked }))}
                />
              </div>
            </>
          ) : null}

          {sectionTab === "message" ? (
            <>
              <Field label="Título del embed">
                <Input
                  value={active.title}
                  onChange={(event) => setActive((current) => ({ ...current, title: event.target.value }))}
                />
              </Field>
              <Field label="Mensaje" description="Variables: {user}, {username}, {server}, {memberCount}">
                <Textarea
                  value={active.message}
                  onChange={(event) => setActive((current) => ({ ...current, message: event.target.value }))}
                  placeholder="Ej. Bienvenido {user} a {server}"
                />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Color (hex)">
                  <Input
                    value={active.color}
                    onChange={(event) => setActive((current) => ({ ...current, color: event.target.value.replace("#", "") }))}
                    placeholder="7c4dff"
                  />
                </Field>
                <Field label="Pie de embed">
                  <Input
                    value={active.footer}
                    onChange={(event) => setActive((current) => ({ ...current, footer: event.target.value }))}
                  />
                </Field>
              </div>
            </>
          ) : null}

          {sectionTab === "media" ? (
            <>
              <Field label="Imagen principal" description="URL opcional para el embed.">
                <Input
                  value={active.imageUrl}
                  onChange={(event) => setActive((current) => ({ ...current, imageUrl: event.target.value }))}
                  placeholder="https://..."
                />
              </Field>
              <Field label="Miniatura" description="avatar, url o none">
                <Input
                  value={active.thumbnailMode}
                  onChange={(event) => setActive((current) => ({ ...current, thumbnailMode: event.target.value }))}
                />
              </Field>
              {active.thumbnailMode === "url" ? (
                <Field label="URL miniatura">
                  <Input
                    value={active.thumbnailUrl}
                    onChange={(event) => setActive((current) => ({ ...current, thumbnailUrl: event.target.value }))}
                    placeholder="https://..."
                  />
                </Field>
              ) : null}
            </>
          ) : null}

          {sectionTab === "dm" ? (
            <>
              <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
                <div>
                  <p className="font-medium text-white">Enviar mensaje privado</p>
                  <p className="text-sm text-zinc-400">
                    {tab === "welcome"
                      ? "Recibe al usuario por DM además del canal."
                      : "Opcional: avisa por DM al salir del servidor."}
                  </p>
                </div>
                <Switch
                  checked={active.dmEnabled}
                  onCheckedChange={(checked) => setActive((current) => ({ ...current, dmEnabled: checked }))}
                />
              </div>
              <Field label="Texto del DM" description="Variables: {username}, {server}, {memberCount}">
                <Textarea
                  value={active.dmMessage}
                  onChange={(event) => setActive((current) => ({ ...current, dmMessage: event.target.value }))}
                  placeholder="Mensaje privado para el miembro"
                />
              </Field>
            </>
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
            {active.dmEnabled ? " · DM activo" : ""}
          </p>
          <p className="mt-2 text-sm font-medium text-white">{active.title || "Sin título"}</p>
          <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-100">
            {active.message || "Aún no hay un mensaje configurado para esta pestaña."}
          </p>
          {active.dmEnabled ? (
            <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
                <Mail className="h-3.5 w-3.5" />
                DM
              </div>
              <p className="text-sm text-zinc-300">{active.dmMessage || "Sin mensaje DM configurado."}</p>
            </div>
          ) : null}
          <p className="mt-4 text-sm text-zinc-400">
            Canal: {channels.find((channel) => channel.id === active.channelId)?.name || "Sin canal"}
          </p>
        </div>
      </SectionCard>
    </PaneGrid>
  );
}
