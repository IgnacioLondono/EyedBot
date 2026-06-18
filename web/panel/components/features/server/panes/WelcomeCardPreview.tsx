"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Move, RefreshCw } from "lucide-react";
import { previewWelcomeCardBlob } from "@/lib/api/endpoints";
import {
  WELCOME_CARD_HEIGHT,
  WELCOME_CARD_WIDTH,
  buildWelcomeCardPreviewBody,
  type WelcomeCardLayout,
  type WelcomeCardPreviewInput,
} from "@/lib/welcome-card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/utils";

type DragTarget = "avatar" | "title" | "name" | "subtitle" | "overlay" | "bg";

const HANDLES: { id: DragTarget; label: string; color: string }[] = [
  { id: "avatar", label: "Avatar", color: "#4ade80" },
  { id: "title", label: "Título", color: "#f472b6" },
  { id: "name", label: "Nombre", color: "#60a5fa" },
  { id: "subtitle", label: "Subtítulo", color: "#c4b5fd" },
  { id: "overlay", label: "Esquina", color: "#fbbf24" },
  { id: "bg", label: "Foco fondo", color: "#38bdf8" },
];

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

export function WelcomeCardPreview({
  guildId,
  config,
  layout,
  onLayoutChange,
}: {
  guildId: string;
  config: WelcomeCardPreviewInput;
  layout: WelcomeCardLayout;
  onLayoutChange: (layout: WelcomeCardLayout) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTarget, setActiveTarget] = useState<DragTarget>("avatar");
  const [dragging, setDragging] = useState<DragTarget | null>(null);
  const previewUrlRef = useRef("");

  const refreshPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const blob = await previewWelcomeCardBlob(guildId, buildWelcomeCardPreviewBody({ ...config, cardLayout: layout }));
      const url = URL.createObjectURL(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [guildId, config, layout]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshPreview(), 450);
    return () => window.clearTimeout(timer);
  }, [refreshPreview]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateScale = () => {
      const width = node.clientWidth;
      if (width > 0) setScale(width / WELCOME_CARD_WIDTH);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const pointerToCard = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return {
        x: (clientX - rect.left) / scale,
        y: (clientY - rect.top) / scale,
      };
    },
    [scale]
  );

  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    if (!dragging) return;
    const target = dragging;

    function onMove(event: PointerEvent) {
      const pos = pointerToCard(event.clientX, event.clientY);
      if (!pos) return;
      const next = applyHandlePosition(target, layoutRef.current, pos.x, pos.y);
      layoutRef.current = next;
      onLayoutChange(next);
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
  }, [dragging, onLayoutChange, pointerToCard]);

  const displayHeight = WELCOME_CARD_HEIGHT * scale;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Vista previa en vivo</p>
        <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => void refreshPreview()}>
          <RefreshCw className={cn("mr-2 h-3.5 w-3.5", loading && "animate-spin")} />
          Actualizar
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {HANDLES.map((handle) => (
          <button
            key={handle.id}
            type="button"
            onClick={() => setActiveTarget(handle.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition",
              activeTarget === handle.id
                ? "border-white/30 bg-white/15 text-white"
                : "border-white/10 bg-black/20 text-zinc-400 hover:text-zinc-200"
            )}
          >
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: handle.color }} />
            {handle.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-zinc-500">
        Selecciona un elemento y arrástralo sobre la tarjeta. El foco del fondo recorta la imagen de fondo.
      </p>

      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-black/30"
        style={{ height: displayHeight }}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Vista previa de bienvenida" className="block h-full w-full object-contain" draggable={false} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            {loading ? <Spinner className="h-6 w-6" /> : "Generando vista previa…"}
          </div>
        )}

        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-[1px]">
            <Spinner className="h-7 w-7" />
          </div>
        ) : null}

        {HANDLES.map((handle) => {
          const pos = getHandlePosition(handle.id, layout);
          const isActive = activeTarget === handle.id || dragging === handle.id;
          const left = pos.x * scale;
          const top = pos.y * scale;
          const radius = "r" in pos && pos.r ? pos.r * scale : 0;

          return (
            <div key={handle.id}>
              {handle.id === "avatar" && radius > 0 ? (
                <div
                  className={cn(
                    "pointer-events-none absolute rounded-full border-2 border-dashed transition",
                    isActive ? "border-white/80" : "border-white/25"
                  )}
                  style={{
                    left: left - radius,
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
                }}
                className={cn(
                  "absolute z-10 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[10px] font-bold shadow-lg transition",
                  isActive ? "scale-110 border-white text-white" : "border-white/70 text-white/90"
                )}
                style={{
                  left,
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

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      <p className="text-xs text-zinc-500">
        Tamaño real enviado a Discord: {WELCOME_CARD_WIDTH}×{WELCOME_CARD_HEIGHT}px
      </p>
    </div>
  );
}
