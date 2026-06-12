"use client";

import { useRef, useState } from "react";
import { ImageIcon, Sparkles, Trash2, Upload } from "lucide-react";
import { useThemeSettings } from "@/components/providers/ThemeProvider";
import { usePanel } from "@/components/providers/PanelProvider";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import {
  Field,
  Input,
  LockedOverlay,
  PremiumLock,
  SectionCard,
} from "@/components/features/shared";
import {
  THEME_PRESETS as THEME_PRESET_COLORS,
  THEME_PRESET_LABELS,
  type ThemePresetId,
} from "@/lib/theme-presets";
import { clearWallpaperFromIdb } from "@/lib/hooks/useWallpaperStorage";

function SliderField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={`${label} (${value}%)`}>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-violet-500"
      />
    </Field>
  );
}

export function ThemeSettings() {
  const { hasPremium } = usePanel();
  const { theme, setTheme, applyThemePreset, resetTheme, refreshWallpaper, uploadWallpaper, premiumLocked } =
    useThemeSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleWallpaperUpload(file: File | null) {
    if (!file || !hasPremium) return;
    setUploading(true);
    try {
      if (file.size > 180 * 1024 * 1024) {
        throw new Error("El archivo supera el límite de 180 MB.");
      }
      await uploadWallpaper(file);
    } finally {
      setUploading(false);
    }
  }

  async function removeWallpaper() {
    await clearWallpaperFromIdb();
    setTheme({
      wallpaperEnabled: false,
      wallpaperStorage: "none",
      wallpaperKind: "none",
      wallpaperMime: "",
      wallpaperUrl: "",
    });
    await refreshWallpaper();
  }

  return (
    <div className="relative space-y-5">
      <LockedOverlay
        visible={premiumLocked}
        title="Tema premium"
        description="La personalización completa se desbloquea con EyedPlus+."
      />

      <SectionCard
        title="Temas preestablecidos"
        description="Aplica una paleta completa con un clic."
        action={<PremiumLock locked={!hasPremium} />}
      >
        <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-4 ${!hasPremium ? "pointer-events-none opacity-50" : ""}`}>
          {(Object.keys(THEME_PRESET_LABELS) as ThemePresetId[]).map((presetId) => (
            <button
              key={presetId}
              type="button"
              onClick={() => applyThemePreset(presetId)}
              className={`rounded-2xl border p-4 text-left transition hover:border-violet-400/40 ${
                theme.preset === presetId ? "border-violet-400/60 bg-violet-500/10" : "border-white/10 bg-black/20"
              }`}
            >
              <div className="mb-3 flex gap-1">
                <span className="h-6 w-6 rounded-full" style={{ background: THEME_PRESET_COLORS[presetId]?.accentPrimary }} />
                <span className="h-6 w-6 rounded-full" style={{ background: THEME_PRESET_COLORS[presetId]?.accentSecondary }} />
                <span className="h-6 w-6 rounded-full border border-white/10" style={{ background: THEME_PRESET_COLORS[presetId]?.bgPrimary }} />
              </div>
              <p className="font-medium text-white">{THEME_PRESET_LABELS[presetId]}</p>
              <p className="text-xs text-zinc-500">Preset {presetId}</p>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Colores y atmósfera" description="Ajusta la paleta manualmente.">
        <div className={`space-y-5 ${!hasPremium ? "pointer-events-none opacity-50" : ""}`}>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["accentPrimary", "Acento principal"],
              ["accentSecondary", "Acento secundario"],
              ["bgPrimary", "Fondo principal"],
              ["bgSecondary", "Fondo secundario"],
              ["bgCard", "Tarjetas"],
              ["textPrimary", "Texto principal"],
              ["textSecondary", "Texto secundario"],
              ["borderColor", "Bordes"],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <Input
                  type="color"
                  value={theme[key as keyof typeof theme] as string}
                  onChange={(event) => setTheme({ [key]: event.target.value })}
                  className="h-14 p-2"
                />
              </Field>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SliderField label="Atmósfera" value={theme.atmosphere} onChange={(atmosphere) => setTheme({ atmosphere })} />
            <SliderField
              label="Fuerza de bordes"
              value={theme.borderStrength}
              onChange={(borderStrength) => setTheme({ borderStrength })}
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <span className="text-sm text-white">Contraste automático</span>
              <Switch checked={theme.autoContrast} onCheckedChange={(autoContrast) => setTheme({ autoContrast })} />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <span className="text-sm text-white">Burbujas de fondo</span>
              <Switch
                checked={theme.backgroundBubbles}
                onCheckedChange={(backgroundBubbles) => setTheme({ backgroundBubbles })}
              />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Fondo personalizado" description="Sube imagen o vídeo. Se guarda localmente en tu navegador.">
        <div className={`space-y-5 ${!hasPremium ? "pointer-events-none opacity-50" : ""}`}>
          <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
            <div>
              <p className="font-medium text-white">Wallpaper activo</p>
              <p className="text-sm text-zinc-400">Imagen o vídeo detrás del panel con velo y bloom.</p>
            </div>
            <Switch
              checked={theme.wallpaperEnabled}
              onCheckedChange={(wallpaperEnabled) => setTheme({ wallpaperEnabled })}
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 p-4">
            <div>
              <p className="font-medium text-white">Desenfoque del fondo</p>
              <p className="text-sm text-zinc-400">Desactívalo para ver la imagen o vídeo nítido detrás del panel.</p>
            </div>
            <Switch
              checked={theme.wallpaperBlur}
              onCheckedChange={(wallpaperBlur) => setTheme({ wallpaperBlur })}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SliderField
              label={theme.wallpaperBlur ? "Intensidad del blur" : "Bloom (activa el blur)"}
              value={theme.wallpaperBloom}
              onChange={(wallpaperBloom) => setTheme({ wallpaperBloom })}
            />
            <SliderField label="Velo oscuro" value={theme.wallpaperVeil} onChange={(wallpaperVeil) => setTheme({ wallpaperVeil })} />
          </div>

          <div className="flex flex-wrap gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(event) => void handleWallpaperUpload(event.target.files?.[0] || null)}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? "Subiendo..." : "Subir fondo"}
            </Button>
            <Button variant="danger" onClick={() => void removeWallpaper()}>
              <Trash2 className="mr-2 h-4 w-4" />
              Quitar fondo
            </Button>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
            <div className="mb-3 flex items-center gap-2 text-white">
              <ImageIcon className="h-5 w-5" />
              Estado del wallpaper
            </div>
            <p className="text-sm text-zinc-300">
              {theme.wallpaperEnabled
                ? `Activo (${theme.wallpaperStorage === "indexeddb" ? "IndexedDB" : "inline"}) · ${theme.wallpaperKind}`
                : "Sin fondo personalizado."}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Preview" description="Vista previa del estudio de tema.">
        <div
          className="rounded-[28px] border p-6"
          style={{
            borderColor: `${theme.borderColor}66`,
            background: `linear-gradient(180deg, ${theme.bgSecondary} 0%, ${theme.bgCard} 100%)`,
            color: theme.textPrimary,
          }}
        >
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-5 w-5" style={{ color: theme.accentPrimary }} />
            <span className="font-semibold">EyedBot Studio</span>
          </div>
          <p style={{ color: theme.textSecondary }}>
            Los cambios se aplican al instante y se guardan en localStorage.
          </p>
          <div className="mt-4 flex gap-2">
            <span className="rounded-full px-3 py-1 text-xs" style={{ background: `${theme.accentPrimary}33`, color: theme.accentPrimary }}>
              Acento
            </span>
            <span className="rounded-full px-3 py-1 text-xs" style={{ background: `${theme.accentSecondary}33`, color: theme.accentSecondary }}>
              Secundario
            </span>
          </div>
        </div>
        <div className="mt-4">
          <Button variant="secondary" onClick={resetTheme}>
            Restaurar tema por defecto
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
