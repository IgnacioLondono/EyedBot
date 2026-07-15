"use client";

import { useEffect, useMemo, useState } from "react";
import { DoorOpen, ImageIcon, Mail, PartyPopper, Type } from "lucide-react";
import {
  deleteWelcomeImage,
  getGoodbyeConfig,
  getWelcomeConfig,
  saveGoodbyeConfig,
  saveWelcomeConfig,
  testGoodbye,
  testWelcome,
  uploadWelcomeImage,
} from "@/lib/api/endpoints";
import { useGuildChannels } from "@/lib/hooks/useGuildChannels";
import { usePanel } from "@/components/providers/PanelProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { paneTabKey, usePersistedTab } from "@/lib/hooks/usePersistedTab";
import { Alert } from "@/components/ui/Alert";
import { Tabs } from "@/components/ui/Tabs";
import { Switch } from "@/components/ui/Switch";
import {
  ChannelSelect,
  ColorInput,
  Field,
  FormActions,
  Input,
  PaneGrid,
  SectionCard,
  Select,
  Textarea,
} from "@/components/features/shared";
import { EmbedImageField } from "@/components/features/embed/EmbedImageField";
import { DiscordEmbedPreview } from "@/components/features/embed/EmbedPreview";
import { plainColorToHex } from "@/lib/embed-utils";
import { asRecord, getErrorMessage, toBooleanValue, toStringValue } from "@/lib/utils";
import {
  DEFAULT_WELCOME_CARD_LAYOUT,
  WELCOME_FONT_OPTIONS,
  mergeWelcomeCardLayout,
  type WelcomeCardLayout,
} from "@/lib/welcome-card";
import { WelcomeCardPreview } from "./WelcomeCardPreview";

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
  welcomeStyle: "embed" | "card";
  cardAccentColor: string;
  cardTitleColor: string;
  cardNameColor: string;
  cardSubtitleColor: string;
  cardNameTemplate: string;
  cardOverlayText: string;
  cardOverlayColor: string;
  cardFontKey: string;
  cardLayout: WelcomeCardLayout;
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
  welcomeStyle: "embed",
  cardAccentColor: "4ade80",
  cardTitleColor: "ffffff",
  cardNameColor: "f8fafc",
  cardSubtitleColor: "e2e8f0",
  cardNameTemplate: "{username}",
  cardOverlayText: "",
  cardOverlayColor: "ffffff",
  cardFontKey: "system",
  cardLayout: { ...DEFAULT_WELCOME_CARD_LAYOUT },
};

function normalizeConfig(value: unknown, mode: "welcome" | "goodbye"): ConfigState {
  const data = asRecord(value);
  const layoutRaw = asRecord(data.cardLayout);
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
    welcomeStyle: toStringValue(data.welcomeStyle, "embed") === "card" ? "card" : "embed",
    cardAccentColor: toStringValue(data.cardAccentColor, "4ade80").replace("#", ""),
    cardTitleColor: toStringValue(data.cardTitleColor, "ffffff").replace("#", ""),
    cardNameColor: toStringValue(data.cardNameColor, "f8fafc").replace("#", ""),
    cardSubtitleColor: toStringValue(data.cardSubtitleColor, "e2e8f0").replace("#", ""),
    cardNameTemplate: toStringValue(data.cardNameTemplate, "{username}"),
    cardOverlayText: toStringValue(data.cardOverlayText),
    cardOverlayColor: toStringValue(data.cardOverlayColor, "ffffff").replace("#", ""),
    cardFontKey: toStringValue(data.cardFontKey, "system"),
    cardLayout: mergeWelcomeCardLayout(layoutRaw as Partial<WelcomeCardLayout>),
  };
}

function configToPayload(config: ConfigState) {
  return { ...config };
}

export function WelcomePane({ guildId }: { guildId: string }) {
  const { channels } = useGuildChannels(guildId);
  const { bootstrap } = usePanel();
  const welcomeCardEnabled = bootstrap?.welcomeCardStyleEnabled !== false;
  const { toast } = useToast();
  const [tab, setTab] = usePersistedTab(paneTabKey(guildId, "welcome"), "welcome", ["welcome", "goodbye"]);
  const [sectionTab, setSectionTab] = usePersistedTab(
    paneTabKey(guildId, "welcome", "section"),
    "general",
    ["general", "content", "design", "media", "dm", "message"]
  );
  const [welcome, setWelcome] = useState<ConfigState>(defaultState);
  const [goodbye, setGoodbye] = useState<ConfigState>(defaultState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [uploadingMainImage, setUploadingMainImage] = useState(false);
  const [uploadingThumbImage, setUploadingThumbImage] = useState(false);
  const [deletingMainImage, setDeletingMainImage] = useState(false);
  const [deletingThumbImage, setDeletingThumbImage] = useState(false);
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
  const imageSlot = tab === "welcome" ? "welcome" : "goodbye";
  const thumbSlot = tab === "welcome" ? "welcome_thumb" : "goodbye_thumb";
  const isCardWelcome = tab === "welcome" && welcome.welcomeStyle === "card" && welcomeCardEnabled;

  useEffect(() => {
    if (!welcomeCardEnabled && welcome.welcomeStyle === "card") {
      setWelcome((current) => ({ ...current, welcomeStyle: "embed" }));
    }
  }, [welcomeCardEnabled, welcome.welcomeStyle]);

  useEffect(() => {
    if (!isCardWelcome && (sectionTab === "content" || sectionTab === "design")) {
      setSectionTab("message");
    }
  }, [isCardWelcome, sectionTab]);

  const cardPreviewConfig = useMemo(
    () => ({
      title: welcome.title,
      message: welcome.message,
      imageUrl: welcome.imageUrl,
      cardNameTemplate: welcome.cardNameTemplate,
      cardOverlayText: welcome.cardOverlayText,
      cardAccentColor: welcome.cardAccentColor,
      cardTitleColor: welcome.cardTitleColor,
      cardNameColor: welcome.cardNameColor,
      cardSubtitleColor: welcome.cardSubtitleColor,
      cardOverlayColor: welcome.cardOverlayColor,
      cardFontKey: welcome.cardFontKey,
      cardLayout: welcome.cardLayout,
    }),
    [welcome]
  );

  const sectionTabs = useMemo(() => {
    if (isCardWelcome) {
      return [
        { id: "general", label: "General" },
        { id: "content", label: "Textos" },
        { id: "design", label: "Diseño" },
        { id: "media", label: "Fondo" },
        { id: "dm", label: "DM" },
      ];
    }
    return [
      { id: "general", label: "General" },
      { id: "message", label: "Mensaje" },
      { id: "media", label: "Imágenes" },
      { id: "dm", label: "DM" },
    ];
  }, [isCardWelcome]);

  function applyConfigFromUpload(payload: unknown) {
    const root = asRecord(payload);
    const config = asRecord(root.config);
    if (Object.keys(config).length) {
      setActive(normalizeConfig(config, tab as "welcome" | "goodbye"));
      return;
    }
    const nextUrl = toStringValue(root.path || root.url);
    if (nextUrl) {
      setActive((current) => ({ ...current, imageUrl: nextUrl }));
    }
  }

  async function handleUploadImage(file: File, slot: string, kind: "main" | "thumb") {
    const setUploading = kind === "main" ? setUploadingMainImage : setUploadingThumbImage;
    setUploading(true);
    try {
      const result = await uploadWelcomeImage(guildId, file, slot);
      applyConfigFromUpload(result);
      if (kind === "thumb") {
        setActive((current) => ({ ...current, thumbnailMode: "url" }));
      }
      toast({
        title: "Imagen subida",
        description: isCardWelcome ? "El fondo de la tarjeta fue guardado." : "La imagen del embed fue guardada.",
        tone: "success",
      });
    } catch (err) {
      toast({ title: "No se pudo subir", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteImage(slot: string, kind: "main" | "thumb") {
    const setDeleting = kind === "main" ? setDeletingMainImage : setDeletingThumbImage;
    setDeleting(true);
    try {
      const result = await deleteWelcomeImage(guildId, slot);
      const config = asRecord(asRecord(result).config);
      if (Object.keys(config).length) {
        setActive(normalizeConfig(config, tab as "welcome" | "goodbye"));
      } else if (kind === "main") {
        setActive((current) => ({ ...current, imageUrl: "" }));
      } else {
        setActive((current) => ({ ...current, thumbnailUrl: "" }));
      }
      toast({ title: "Imagen eliminada", description: "Se quitó la imagen.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo eliminar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (tab === "welcome") {
        await saveWelcomeConfig(guildId, configToPayload(welcome));
      } else {
        await saveGoodbyeConfig(guildId, configToPayload(goodbye));
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
            }}
          />
        }
      >
        <Tabs
          items={sectionTabs}
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
              {tab === "welcome" && welcomeCardEnabled ? (
                <Field label="Formato del mensaje" description="Embed clásico o tarjeta con imagen generada automáticamente.">
                  <Select
                    value={welcome.welcomeStyle}
                    onChange={(event) => {
                      const style = event.target.value === "card" ? "card" : "embed";
                      setWelcome((current) => ({ ...current, welcomeStyle: style }));
                      setSectionTab("general");
                    }}
                  >
                    <option value="embed">Embed de Discord</option>
                    <option value="card">Tarjeta con imagen</option>
                  </Select>
                </Field>
              ) : null}
            </>
          ) : null}

          {sectionTab === "message" || sectionTab === "content" ? (
            <>
              {isCardWelcome ? (
                <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4 text-sm text-violet-100">
                  <div className="mb-2 flex items-center gap-2 font-medium">
                    <Type className="h-4 w-4" />
                    Textos de la tarjeta
                  </div>
                  <p className="text-violet-200/90">
                    Variables: {"{user}"}, {"{username}"}, {"{server}"}, {"{memberCount}"}. Para colores en línea usa{" "}
                    <code className="rounded bg-black/30 px-1">[[#ff6b6b]]texto[[/]]</code>.
                  </p>
                </div>
              ) : null}

              <Field label={isCardWelcome ? "Título (cabecera)" : "Título del embed"}>
                <Input
                  value={active.title}
                  onChange={(event) => setActive((current) => ({ ...current, title: event.target.value }))}
                />
              </Field>

              {isCardWelcome ? (
                <Field label="Nombre mostrado" description="Texto grande bajo el avatar. Por defecto el nombre del usuario.">
                  <Input
                    value={welcome.cardNameTemplate}
                    onChange={(event) => setWelcome((current) => ({ ...current, cardNameTemplate: event.target.value }))}
                    placeholder="{username}"
                  />
                </Field>
              ) : null}

              <Field
                label={isCardWelcome ? "Subtítulo / mensaje" : "Mensaje"}
                description={isCardWelcome ? undefined : "Variables: {user}, {username}, {server}, {memberCount}"}
              >
                <Textarea
                  value={active.message}
                  onChange={(event) => setActive((current) => ({ ...current, message: event.target.value }))}
                  placeholder={isCardWelcome ? "Ej. ¡Hola {user}! Bienvenido a {server}" : "Ej. Bienvenido {user} a {server}"}
                />
              </Field>

              {isCardWelcome ? (
                <Field label="Texto en esquina" description="Opcional. Aparece abajo a la derecha (p. ej. #{memberCount}).">
                  <Input
                    value={welcome.cardOverlayText}
                    onChange={(event) => setWelcome((current) => ({ ...current, cardOverlayText: event.target.value }))}
                    placeholder="#{memberCount}"
                  />
                </Field>
              ) : null}

              {!isCardWelcome ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Color del embed">
                    <ColorInput value={active.color} onChange={(color) => setActive((current) => ({ ...current, color }))} />
                  </Field>
                  <Field label="Pie de embed">
                    <Input
                      value={active.footer}
                      onChange={(event) => setActive((current) => ({ ...current, footer: event.target.value }))}
                    />
                  </Field>
                </div>
              ) : null}
            </>
          ) : null}

          {sectionTab === "design" && isCardWelcome ? (
            <>
              <Field label="Fuente de la tarjeta">
                <Select
                  value={welcome.cardFontKey}
                  onChange={(event) => setWelcome((current) => ({ ...current, cardFontKey: event.target.value }))}
                >
                  {WELCOME_FONT_OPTIONS.map((font) => (
                    <option key={font.value} value={font.value}>
                      {font.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Tamaño del avatar" description={`Radio en píxeles (${welcome.cardLayout.avatarR}px).`}>
                <input
                  type="range"
                  min={36}
                  max={150}
                  value={welcome.cardLayout.avatarR}
                  onChange={(event) =>
                    setWelcome((current) => ({
                      ...current,
                      cardLayout: { ...current.cardLayout, avatarR: Number(event.target.value) },
                    }))
                  }
                  className="w-full accent-violet-400"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Foco horizontal del fondo">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(welcome.cardLayout.bgFocalX * 100)}
                    onChange={(event) =>
                      setWelcome((current) => ({
                        ...current,
                        cardLayout: { ...current.cardLayout, bgFocalX: Number(event.target.value) / 100 },
                      }))
                    }
                    className="w-full accent-sky-400"
                  />
                </Field>
                <Field label="Foco vertical del fondo">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(welcome.cardLayout.bgFocalY * 100)}
                    onChange={(event) =>
                      setWelcome((current) => ({
                        ...current,
                        cardLayout: { ...current.cardLayout, bgFocalY: Number(event.target.value) / 100 },
                      }))
                    }
                    className="w-full accent-sky-400"
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Color del anillo (avatar)">
                  <ColorInput
                    value={welcome.cardAccentColor}
                    onChange={(color) => setWelcome((current) => ({ ...current, cardAccentColor: color }))}
                  />
                </Field>
                <Field label="Color del título">
                  <ColorInput
                    value={welcome.cardTitleColor}
                    onChange={(color) => setWelcome((current) => ({ ...current, cardTitleColor: color }))}
                  />
                </Field>
                <Field label="Color del nombre">
                  <ColorInput
                    value={welcome.cardNameColor}
                    onChange={(color) => setWelcome((current) => ({ ...current, cardNameColor: color }))}
                  />
                </Field>
                <Field label="Color del subtítulo">
                  <ColorInput
                    value={welcome.cardSubtitleColor}
                    onChange={(color) => setWelcome((current) => ({ ...current, cardSubtitleColor: color }))}
                  />
                </Field>
                <Field label="Color texto esquina">
                  <ColorInput
                    value={welcome.cardOverlayColor}
                    onChange={(color) => setWelcome((current) => ({ ...current, cardOverlayColor: color }))}
                  />
                </Field>
              </div>

              <ButtonResetLayout onReset={() => setWelcome((current) => ({ ...current, cardLayout: { ...DEFAULT_WELCOME_CARD_LAYOUT } }))} />
            </>
          ) : null}

          {sectionTab === "media" ? (
            <>
              <div className="mb-1 flex items-center gap-2 text-sm text-zinc-400">
                <ImageIcon className="h-4 w-4" />
                {isCardWelcome ? "Imagen de fondo de la tarjeta" : "Imágenes del embed"}
              </div>
              <EmbedImageField
                label={isCardWelcome ? "Fondo de la tarjeta" : "Imagen principal"}
                description={isCardWelcome ? "Se recorta a 920×520. Ajusta el foco en Diseño o arrastrando «Foco fondo»." : "URL externa o archivo subido al panel."}
                value={active.imageUrl}
                onChange={(imageUrl) => setActive((current) => ({ ...current, imageUrl }))}
                uploading={uploadingMainImage}
                deleting={deletingMainImage}
                onUpload={(file) => handleUploadImage(file, imageSlot, "main")}
                onDelete={() => handleDeleteImage(imageSlot, "main")}
              />
              {!isCardWelcome ? (
                <>
                  <Field label="Miniatura" description="Avatar del usuario, URL personalizada o sin miniatura.">
                    <Select
                      value={active.thumbnailMode}
                      onChange={(event) => setActive((current) => ({ ...current, thumbnailMode: event.target.value }))}
                    >
                      <option value="avatar">Avatar del usuario</option>
                      <option value="url">URL / imagen subida</option>
                      <option value="none">Sin miniatura</option>
                    </Select>
                  </Field>
                  {active.thumbnailMode === "url" ? (
                    <EmbedImageField
                      label="Miniatura del embed"
                      description="Se muestra arriba a la derecha en Discord."
                      value={active.thumbnailUrl}
                      onChange={(thumbnailUrl) => setActive((current) => ({ ...current, thumbnailUrl }))}
                      uploading={uploadingThumbImage}
                      deleting={deletingThumbImage}
                      onUpload={(file) => handleUploadImage(file, thumbSlot, "thumb")}
                      onDelete={() => handleDeleteImage(thumbSlot, "thumb")}
                    />
                  ) : null}
                </>
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
        title={isCardWelcome ? "Editor visual de tarjeta" : tab === "welcome" ? "Vista narrativa" : "Mensaje de salida"}
        description={
          isCardWelcome
            ? "Arrastra los elementos para colocar avatar, textos y foco del fondo."
            : "Resumen rápido del tono y entrega actual."
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
              {tab === "welcome" ? <PartyPopper className="h-5 w-5" /> : <DoorOpen className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                {active.enabled ? "Activo" : "Inactivo"}
                {active.dmEnabled ? " · DM activo" : ""}
                {isCardWelcome ? " · Tarjeta" : ""}
              </p>
              <p className="text-sm text-zinc-400">
                Canal: {channels.find((channel) => channel.id === active.channelId)?.name || "Sin canal"}
              </p>
            </div>
          </div>

          {isCardWelcome ? (
            <WelcomeCardPreview
              guildId={guildId}
              config={cardPreviewConfig}
              layout={welcome.cardLayout}
              onLayoutChange={(cardLayout) => setWelcome((current) => ({ ...current, cardLayout }))}
            />
          ) : (
            <DiscordEmbedPreview
              title={active.title || "Sin título"}
              description={active.message || "Aún no hay un mensaje configurado para esta pestaña."}
              color={plainColorToHex(active.color)}
              footer={active.footer}
              imageUrl={active.imageUrl}
              thumbnailUrl={active.thumbnailMode === "url" ? active.thumbnailUrl : ""}
              thumbnailLabel={active.thumbnailMode === "avatar" ? "Avatar del usuario" : undefined}
            />
          )}

          {active.dmEnabled ? (
            <div className="rounded-2xl border border-white/8 bg-black/20 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
                <Mail className="h-3.5 w-3.5" />
                DM
              </div>
              <p className="text-sm text-zinc-300">{active.dmMessage || "Sin mensaje DM configurado."}</p>
            </div>
          ) : null}
        </div>
      </SectionCard>
    </PaneGrid>
  );
}

function ButtonResetLayout({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      onClick={onReset}
      className="text-sm text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
    >
      Restaurar posiciones por defecto
    </button>
  );
}
