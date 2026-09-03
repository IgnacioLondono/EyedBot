"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ImageIcon,
  Move,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Type,
} from "lucide-react";
import {
  deleteWelcomeImage,
  getWelcomeConfig,
  previewWelcomeCardBlob,
  saveWelcomeConfig,
  testWelcome,
  uploadWelcomeImage,
} from "@/lib/api/endpoints";
import { useToast } from "@/components/providers/ToastProvider";
import { EmbedImageField } from "@/components/features/embed/EmbedImageField";
import { ColorInput, Field, Input, Select, Textarea } from "@/components/features/shared";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Tabs } from "@/components/ui/Tabs";
import { Alert } from "@/components/ui/Alert";
import { serverPaneHref } from "@/lib/navigation";
import {
  DEFAULT_WELCOME_CARD_LAYOUT,
  WELCOME_CARD_HEIGHT,
  WELCOME_CARD_WIDTH,
  WELCOME_FONT_OPTIONS,
  buildWelcomeCardPreviewBody,
  mergeWelcomeCardLayout,
  type WelcomeCardLayout,
} from "@/lib/welcome-card";
import { asRecord, getErrorMessage, toBooleanValue, toStringValue } from "@/lib/utils";
import { cn } from "@/lib/utils";

type DragTarget = "avatar" | "title" | "name" | "subtitle" | "overlay" | "bg";

type CardConfig = {
  enabled: boolean;
  channelId: string;
  mentionUser: boolean;
  title: string;
  message: string;
  imageUrl: string;
  cardNameTemplate: string;
  cardOverlayText: string;
  cardAccentColor: string;
  cardTitleColor: string;
  cardNameColor: string;
  cardSubtitleColor: string;
  cardOverlayColor: string;
  cardFontKey: string;
  cardLayout: WelcomeCardLayout;
};

const HANDLES: { id: DragTarget; label: string; color: string; textKey?: keyof CardConfig }[] = [
  { id: "avatar", label: "Avatar", color: "#4ade80" },
  { id: "title", label: "Título", color: "#f472b6", textKey: "title" },
  { id: "name", label: "Nombre", color: "#60a5fa", textKey: "cardNameTemplate" },
  { id: "subtitle", label: "Subtítulo", color: "#c4b5fd", textKey: "message" },
  { id: "overlay", label: "Esquina", color: "#fbbf24", textKey: "cardOverlayText" },
  { id: "bg", label: "Foco fondo", color: "#38bdf8" },
];

const FONT_FAMILY: Record<string, string> = {
  system: "system-ui, sans-serif",
  serif: "Georgia, serif",
  mono: "Consolas, monospace",
  rounded: "Verdana, sans-serif",
  elegant: '"Times New Roman", serif',
  impact: 'Impact, "Arial Black", sans-serif',
  trebuchet: '"Trebuchet MS", sans-serif',
};

function normalizeConfig(value: unknown): CardConfig {
  const data = asRecord(value);
  const layoutRaw = asRecord(data.cardLayout);
  return {
    enabled: toBooleanValue(data.enabled),
    channelId: toStringValue(data.channelId || data.channel_id),
    mentionUser: toBooleanValue(data.mentionUser),
    title: toStringValue(data.title, "¡Bienvenido!"),
    message: toStringValue(data.message || data.content),
    imageUrl: toStringValue(data.imageUrl || data.image_url),
    cardNameTemplate: toStringValue(data.cardNameTemplate, "{username}"),
    cardOverlayText: toStringValue(data.cardOverlayText),
    cardAccentColor: toStringValue(data.cardAccentColor, "4ade80").replace("#", ""),
    cardTitleColor: toStringValue(data.cardTitleColor, "ffffff").replace("#", ""),
    cardNameColor: toStringValue(data.cardNameColor, "f8fafc").replace("#", ""),
    cardSubtitleColor: toStringValue(data.cardSubtitleColor, "e2e8f0").replace("#", ""),
    cardOverlayColor: toStringValue(data.cardOverlayColor, "ffffff").replace("#", ""),
    cardFontKey: toStringValue(data.cardFontKey, "system"),
    cardLayout: mergeWelcomeCardLayout(layoutRaw as Partial<WelcomeCardLayout>),
  };
}

function previewText(text: string) {
  return text
    .replace(/\{user\}/gi, "@Usuario")
    .replace(/\{username\}/gi, "Usuario")
    .replace(/\{server\}/gi, "Mi Servidor")
    .replace(/\{memberCount\}/gi, "1,234")
    .replace(/\[\[#([0-9a-fA-F]{3,6})\]\]([\s\S]*?)\[\[\/\]\]/g, "$2");
}

function hexColor(hex: string) {
  const h = hex.replace("#", "");
  return h.length === 6 ? `#${h}` : "#ffffff";
}

function getHandlePosition(target: DragTarget, layout: WelcomeCardLayout) {
  switch (target) {
    case "avatar":
      return { x: layout.avatarCx, y: layout.avatarCy, r: layout.avatarR };
    case "title":
      return { x: layout.titleX, y: layout.titleY };
    case "name":
      return { x: layout.nameX, y: layout.nameY };
    case "subtitle":
      return { x: layout.subtitleX, y: layout.subtitleY };
    case "overlay":
      return { x: layout.overlayX, y: layout.overlayY };
    case "bg":
      return { x: layout.bgFocalX * WELCOME_CARD_WIDTH, y: layout.bgFocalY * WELCOME_CARD_HEIGHT };
    default:
      return { x: 0, y: 0 };
  }
}

function applyHandlePosition(target: DragTarget, layout: WelcomeCardLayout, x: number, y: number): WelcomeCardLayout {
  const cx = Math.round(Math.min(WELCOME_CARD_WIDTH, Math.max(0, x)));
  const cy = Math.round(Math.min(WELCOME_CARD_HEIGHT, Math.max(0, y)));

  switch (target) {
    case "avatar":
      return { ...layout, avatarCx: cx, avatarCy: cy };
    case "title":
      return { ...layout, titleX: cx, titleY: cy };
    case "name":
      return { ...layout, nameX: cx, nameY: cy };
    case "subtitle":
      return { ...layout, subtitleX: cx, subtitleY: cy };
    case "overlay":
      return { ...layout, overlayX: cx, overlayY: cy };
    case "bg":
      return {
        ...layout,
        bgFocalX: Math.min(1, Math.max(0, x / WELCOME_CARD_WIDTH)),
        bgFocalY: Math.min(1, Math.max(0, y / WELCOME_CARD_HEIGHT)),
      };
    default:
      return layout;
  }
}

export function WelcomeCardStudio({ guildId }: { guildId: string }) {
  const { toast } = useToast();
  const [config, setConfig] = useState<CardConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("texts");
  const [activeTarget, setActiveTarget] = useState<DragTarget>("title");
  const [dragging, setDragging] = useState<DragTarget | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const previewUrlRef = useRef("");
  const layoutRef = useRef(DEFAULT_WELCOME_CARD_LAYOUT);
  const [scale, setScale] = useState(0.6);

  useEffect(() => {
    let active = true;
    getWelcomeConfig(guildId)
      .then((data) => {
        if (!active) return;
        setConfig(normalizeConfig(data));
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

  const previewBody = useMemo(() => {
    if (!config) return null;
    return buildWelcomeCardPreviewBody({
      title: config.title,
      message: config.message,
      imageUrl: config.imageUrl,
      cardNameTemplate: config.cardNameTemplate,
      cardOverlayText: config.cardOverlayText,
      cardAccentColor: config.cardAccentColor,
      cardTitleColor: config.cardTitleColor,
      cardNameColor: config.cardNameColor,
      cardSubtitleColor: config.cardSubtitleColor,
      cardOverlayColor: config.cardOverlayColor,
      cardFontKey: config.cardFontKey,
      cardLayout: config.cardLayout,
      omitText: true,
      previewMode: "layout",
    });
  }, [config]);

  const refreshPreview = useCallback(async () => {
    if (!previewBody) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const blob = await previewWelcomeCardBlob(guildId, previewBody);
      const url = URL.createObjectURL(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (err) {
      setPreviewError(getErrorMessage(err));
    } finally {
      setPreviewLoading(false);
    }
  }, [guildId, previewBody]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshPreview(), 400);
    return () => window.clearTimeout(timer);
  }, [refreshPreview]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (config) layoutRef.current = config.cardLayout;
  }, [config?.cardLayout]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateScale = () => {
      const availW = node.clientWidth;
      const availH = node.clientHeight;
      if (availW <= 0 || availH <= 0) return;
      const scaleW = availW / WELCOME_CARD_WIDTH;
      const scaleH = availH / WELCOME_CARD_HEIGHT;
      setScale(Math.min(scaleW, scaleH, 1));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading]);

  const pointerToCard = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const cardW = WELCOME_CARD_WIDTH * scale;
      const cardH = WELCOME_CARD_HEIGHT * scale;
      const offsetX = (rect.width - cardW) / 2;
      const offsetY = (rect.height - cardH) / 2;
      return {
        x: (clientX - rect.left - offsetX) / scale,
        y: (clientY - rect.top - offsetY) / scale,
      };
    },
    [scale]
  );

  useEffect(() => {
    if (!dragging || !config) return;
    const target = dragging;
    const textTargets = new Set(["title", "name", "subtitle", "overlay"]);

    function onMove(event: PointerEvent) {
      const pos = pointerToCard(event.clientX, event.clientY);
      if (!pos) return;
      // Compensa el handle desplazado a la izquierda en textos.
      const x = textTargets.has(target) ? pos.x + 28 : pos.x;
      const next = applyHandlePosition(target, layoutRef.current, x, pos.y);
      layoutRef.current = next;
      setConfig((current) => (current ? { ...current, cardLayout: next } : current));
    }

    function onUp() {
      setDragging(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, config, pointerToCard]);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    try {
      await saveWelcomeConfig(guildId, {
        ...config,
        welcomeStyle: "card",
      });
      toast({ title: "Tarjeta guardada", description: "Los cambios se aplicaron correctamente.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      await testWelcome(guildId);
      toast({ title: "Prueba enviada", description: "Revisa el canal configurado en Discord.", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo probar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setTesting(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const result = await uploadWelcomeImage(guildId, file, "welcome");
      const root = asRecord(result);
      const saved = asRecord(root.config);
      if (Object.keys(saved).length) {
        setConfig(normalizeConfig(saved));
      } else {
        const nextUrl = toStringValue(root.path || root.url);
        if (nextUrl) setConfig((c) => (c ? { ...c, imageUrl: nextUrl } : c));
      }
      // Fuerza regenerar la preview con el nuevo fondo.
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = "";
      }
      setPreviewUrl("");
      toast({ title: "Fondo subido", description: "La imagen de fondo fue guardada.", tone: "success" });
      window.setTimeout(() => void refreshPreview(), 100);
    } catch (err) {
      toast({ title: "No se pudo subir", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteImage() {
    setDeleting(true);
    try {
      const result = await deleteWelcomeImage(guildId, "welcome");
      const saved = asRecord(asRecord(result).config);
      if (Object.keys(saved).length) {
        setConfig(normalizeConfig(saved));
      } else {
        setConfig((c) => (c ? { ...c, imageUrl: "" } : c));
      }
      toast({ title: "Fondo eliminado", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo eliminar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setDeleting(false);
    }
  }

  const fontFamily = FONT_FAMILY[config?.cardFontKey || "system"] || FONT_FAMILY.system;
  const cardW = WELCOME_CARD_WIDTH * scale;
  const cardH = WELCOME_CARD_HEIGHT * scale;

  if (loading) {
    return (
      <div className="flex h-[calc(100dvh-4rem)] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="p-6">
        <Alert title="No se pudo cargar el studio" description={error || "Configuración no disponible."} variant="danger" />
      </div>
    );
  }

  const activeHandle = HANDLES.find((h) => h.id === activeTarget);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden rounded-none border-0 bg-[#0a0812] lg:h-[100dvh] lg:rounded-none">
      {/* Toolbar */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={serverPaneHref(guildId, "welcome")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-white">Card Studio</h1>
            <p className="truncate text-xs text-zinc-500">
              Tarjeta de bienvenida · {WELCOME_CARD_WIDTH}×{WELCOME_CARD_HEIGHT}px
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={previewLoading} onClick={() => void refreshPreview()}>
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", previewLoading && "animate-spin")} />
            Actualizar
          </Button>
          <Button type="button" variant="secondary" size="sm" loading={testing} onClick={() => void handleTest()}>
            <Send className="mr-1.5 h-3.5 w-3.5" />
            Probar
          </Button>
          <Button type="button" size="sm" loading={saving} onClick={() => void handleSave()}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Guardar
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="flex w-80 shrink-0 flex-col border-r border-white/8">
          <Tabs
            items={[
              { id: "texts", label: "Textos" },
              { id: "design", label: "Diseño" },
              { id: "background", label: "Fondo" },
            ]}
            value={sidebarTab}
            onValueChange={setSidebarTab}
            className="shrink-0 border-b border-white/8 px-3 pt-3"
          />

          <div className="panel-scroll flex-1 space-y-4 overflow-y-auto p-4">
            {sidebarTab === "texts" ? (
              <>
                <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 text-xs text-violet-200">
                  Variables: {"{user}"}, {"{username}"}, {"{server}"}, {"{memberCount}"}. Colores en línea:{" "}
                  <code className="rounded bg-black/30 px-1">[[#ff6b6b]]texto[[/]]</code>
                </div>

                <Field label="Título">
                  <Input
                    value={config.title}
                    onChange={(e) => {
                      setConfig((c) => (c ? { ...c, title: e.target.value } : c));
                      setActiveTarget("title");
                    }}
                    placeholder="¡Bienvenido!"
                  />
                </Field>

                <Field label="Nombre mostrado" description="Texto grande bajo el avatar.">
                  <Input
                    value={config.cardNameTemplate}
                    onChange={(e) => {
                      setConfig((c) => (c ? { ...c, cardNameTemplate: e.target.value } : c));
                      setActiveTarget("name");
                    }}
                    placeholder="{username}"
                  />
                </Field>

                <Field label="Subtítulo / mensaje">
                  <Textarea
                    value={config.message}
                    onChange={(e) => {
                      setConfig((c) => (c ? { ...c, message: e.target.value } : c));
                      setActiveTarget("subtitle");
                    }}
                    placeholder="¡Hola {user}! Bienvenido a {server}"
                    rows={3}
                  />
                </Field>

                <Field label="Texto en esquina" description="Opcional. Abajo a la derecha.">
                  <Input
                    value={config.cardOverlayText}
                    onChange={(e) => {
                      setConfig((c) => (c ? { ...c, cardOverlayText: e.target.value } : c));
                      setActiveTarget("overlay");
                    }}
                    placeholder="#{memberCount}"
                  />
                </Field>
              </>
            ) : null}

            {sidebarTab === "design" ? (
              <>
                <Field label="Fuente">
                  <Select
                    value={config.cardFontKey}
                    onChange={(e) => setConfig((c) => (c ? { ...c, cardFontKey: e.target.value } : c))}
                  >
                    {WELCOME_FONT_OPTIONS.map((font) => (
                      <option key={font.value} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Tamaño del avatar" description={`Radio: ${config.cardLayout.avatarR}px`}>
                  <input
                    type="range"
                    min={36}
                    max={150}
                    value={config.cardLayout.avatarR}
                    onChange={(e) =>
                      setConfig((c) =>
                        c
                          ? { ...c, cardLayout: { ...c.cardLayout, avatarR: Number(e.target.value) } }
                          : c
                      )
                    }
                    className="w-full accent-violet-400"
                  />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Foco horizontal">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(config.cardLayout.bgFocalX * 100)}
                      onChange={(e) =>
                        setConfig((c) =>
                          c
                            ? {
                                ...c,
                                cardLayout: { ...c.cardLayout, bgFocalX: Number(e.target.value) / 100 },
                              }
                            : c
                        )
                      }
                      className="w-full accent-sky-400"
                    />
                  </Field>
                  <Field label="Foco vertical">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(config.cardLayout.bgFocalY * 100)}
                      onChange={(e) =>
                        setConfig((c) =>
                          c
                            ? {
                                ...c,
                                cardLayout: { ...c.cardLayout, bgFocalY: Number(e.target.value) / 100 },
                              }
                            : c
                        )
                      }
                      className="w-full accent-sky-400"
                    />
                  </Field>
                </div>

                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                    <Palette className="h-3.5 w-3.5" />
                    Colores
                  </p>
                  <Field label="Anillo avatar">
                    <ColorInput
                      value={config.cardAccentColor}
                      onChange={(color) => setConfig((c) => (c ? { ...c, cardAccentColor: color } : c))}
                    />
                  </Field>
                  <Field label="Título">
                    <ColorInput
                      value={config.cardTitleColor}
                      onChange={(color) => setConfig((c) => (c ? { ...c, cardTitleColor: color } : c))}
                    />
                  </Field>
                  <Field label="Nombre">
                    <ColorInput
                      value={config.cardNameColor}
                      onChange={(color) => setConfig((c) => (c ? { ...c, cardNameColor: color } : c))}
                    />
                  </Field>
                  <Field label="Subtítulo">
                    <ColorInput
                      value={config.cardSubtitleColor}
                      onChange={(color) => setConfig((c) => (c ? { ...c, cardSubtitleColor: color } : c))}
                    />
                  </Field>
                  <Field label="Esquina">
                    <ColorInput
                      value={config.cardOverlayColor}
                      onChange={(color) => setConfig((c) => (c ? { ...c, cardOverlayColor: color } : c))}
                    />
                  </Field>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setConfig((c) => (c ? { ...c, cardLayout: { ...DEFAULT_WELCOME_CARD_LAYOUT } } : c))
                  }
                  className="flex items-center gap-2 text-sm text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restaurar posiciones
                </button>
              </>
            ) : null}

            {sidebarTab === "background" ? (
              <>
                <div className="mb-1 flex items-center gap-2 text-sm text-zinc-400">
                  <ImageIcon className="h-4 w-4" />
                  Imagen de fondo
                </div>
                <EmbedImageField
                  label="Fondo de la tarjeta"
                  description="Se recorta a 920×520. Ajusta el foco en Diseño o arrastrando «Foco fondo»."
                  value={config.imageUrl}
                  onChange={(imageUrl) => setConfig((c) => (c ? { ...c, imageUrl } : c))}
                  uploading={uploading}
                  deleting={deleting}
                  onUpload={async (file) => {
                    await handleUpload(file);
                  }}
                  onDelete={async () => {
                    await handleDeleteImage();
                  }}
                />
              </>
            ) : null}
          </div>

          {/* Element selector */}
          <div className="shrink-0 border-t border-white/8 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              <Move className="h-3 w-3" />
              Elementos en el lienzo
            </p>
            <div className="flex flex-wrap gap-1.5">
              {HANDLES.map((handle) => (
                <button
                  key={handle.id}
                  type="button"
                  onClick={() => setActiveTarget(handle.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    activeTarget === handle.id
                      ? "border-white/30 bg-white/15 text-white"
                      : "border-white/10 bg-black/20 text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <span
                    className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: handle.color }}
                  />
                  {handle.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Canvas */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-4 py-2">
            <p className="flex items-center gap-2 text-xs text-zinc-500">
              <Type className="h-3.5 w-3.5" />
              Arrastra los elementos para posicionarlos · Selecciona para editar en el panel
            </p>
            {activeHandle ? (
              <span className="text-xs text-zinc-400">
                Seleccionado:{" "}
                <span className="font-medium" style={{ color: activeHandle.color }}>
                  {activeHandle.label}
                </span>
              </span>
            ) : null}
          </div>

          <div ref={containerRef} className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#06050a] p-6">
            {/* Checkerboard background */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, #fff 25%, transparent 25%), linear-gradient(-45deg, #fff 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #fff 75%), linear-gradient(-45deg, transparent 75%, #fff 75%)",
                backgroundSize: "20px 20px",
                backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
              }}
            />

            <div
              className="relative overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10"
              style={{ width: cardW, height: cardH }}
            >
              {config.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={config.imageUrl}
                  alt=""
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                  style={{
                    objectPosition: `${config.cardLayout.bgFocalX * 100}% ${config.cardLayout.bgFocalY * 100}%`,
                    opacity: previewUrl ? 0 : 1,
                  }}
                  draggable={false}
                />
              ) : (
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: "linear-gradient(135deg, #38bdf8 0%, #a78bfa 45%, #34d399 100%)",
                    opacity: previewUrl ? 0 : 1,
                  }}
                />
              )}

              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Vista previa"
                  className="absolute inset-0 h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  {previewLoading ? <Spinner className="h-8 w-8" /> : null}
                </div>
              )}

              {previewLoading && previewUrl ? (
                <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-full bg-black/50 px-2 py-1">
                  <Spinner className="h-4 w-4" />
                </div>
              ) : null}

              {config.title ? (
                <div
                  className={cn(
                    "pointer-events-none absolute z-[5] -translate-x-1/2 whitespace-nowrap px-1 transition",
                    activeTarget === "title" && "rounded ring-2 ring-pink-400/60"
                  )}
                  style={{
                    left: config.cardLayout.titleX * scale,
                    top: config.cardLayout.titleY * scale,
                    color: hexColor(config.cardTitleColor),
                    fontFamily,
                    fontSize: Math.max(14, 44 * scale),
                    fontWeight: 700,
                    textShadow: "0 2px 8px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,1)",
                    lineHeight: 1.1,
                  }}
                >
                  {previewText(config.title)}
                </div>
              ) : null}

              {config.cardNameTemplate ? (
                <div
                  className={cn(
                    "pointer-events-none absolute z-[5] -translate-x-1/2 whitespace-nowrap px-1 transition",
                    activeTarget === "name" && "rounded ring-2 ring-blue-400/60"
                  )}
                  style={{
                    left: config.cardLayout.nameX * scale,
                    top: config.cardLayout.nameY * scale,
                    color: hexColor(config.cardNameColor),
                    fontFamily,
                    fontSize: Math.max(12, 26 * scale),
                    fontWeight: 700,
                    textShadow: "0 2px 6px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,1)",
                    lineHeight: 1.1,
                  }}
                >
                  {previewText(config.cardNameTemplate)}
                </div>
              ) : null}

              {config.message ? (
                <div
                  className={cn(
                    "pointer-events-none absolute z-[5] max-w-[80%] -translate-x-1/2 text-center transition",
                    activeTarget === "subtitle" && "rounded ring-2 ring-purple-400/60"
                  )}
                  style={{
                    left: config.cardLayout.subtitleX * scale,
                    top: config.cardLayout.subtitleY * scale,
                    color: hexColor(config.cardSubtitleColor),
                    fontFamily,
                    fontSize: Math.max(11, 20 * scale),
                    fontStyle: "italic",
                    textShadow: "0 2px 6px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,1)",
                    lineHeight: 1.25,
                  }}
                >
                  {previewText(config.message)}
                </div>
              ) : null}

              {config.cardOverlayText ? (
                <div
                  className={cn(
                    "pointer-events-none absolute z-[5] -translate-x-1/2 -translate-y-full whitespace-nowrap px-1 transition",
                    activeTarget === "overlay" && "rounded ring-2 ring-amber-400/60"
                  )}
                  style={{
                    left: config.cardLayout.overlayX * scale,
                    top: config.cardLayout.overlayY * scale,
                    color: hexColor(config.cardOverlayColor),
                    fontFamily,
                    fontSize: Math.max(10, 17 * scale),
                    fontWeight: 700,
                    textShadow: "0 1px 4px rgba(0,0,0,0.85)",
                    lineHeight: 1.1,
                  }}
                >
                  {previewText(config.cardOverlayText)}
                </div>
              ) : null}

              {HANDLES.map((handle) => {
                const pos = getHandlePosition(handle.id, config.cardLayout);
                const isActive = activeTarget === handle.id || dragging === handle.id;
                const isText = Boolean(handle.textKey);
                const left = pos.x * scale + (isText ? -28 * scale : 0);
                const top = pos.y * scale;
                const radius = "r" in pos && pos.r ? pos.r * scale : 0;

                return (
                  <div key={handle.id}>
                    {handle.id === "avatar" && radius > 0 ? (
                      <div
                        className={cn(
                          "pointer-events-none absolute rounded-full border-2 border-dashed transition",
                          isActive ? "border-white/80" : "border-white/20"
                        )}
                        style={{
                          left: pos.x * scale - radius,
                          top: top - radius,
                          width: radius * 2,
                          height: radius * 2,
                          boxShadow: isActive ? `0 0 0 2px ${handle.color}55` : undefined,
                        }}
                      />
                    ) : null}

                    <button
                      type="button"
                      aria-label={`Mover ${handle.label}`}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        setActiveTarget(handle.id);
                        setDragging(handle.id);
                        if (handle.textKey) setSidebarTab("texts");
                        if (handle.id === "bg") setSidebarTab("design");
                      }}
                      className={cn(
                        "absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[10px] font-bold shadow-lg transition",
                        isActive
                          ? "h-8 w-8 scale-110 border-white text-white"
                          : "h-7 w-7 border-white/70 text-white/90 opacity-90"
                      )}
                      style={{
                        left: handle.id === "avatar" || handle.id === "bg" ? pos.x * scale : left,
                        top,
                        backgroundColor: handle.color,
                        cursor: dragging === handle.id ? "grabbing" : "grab",
                      }}
                    >
                      <Move className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {previewError ? (
            <p className="shrink-0 border-t border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
              {previewError}
            </p>
          ) : null}
        </main>
      </div>
    </div>
  );
}
