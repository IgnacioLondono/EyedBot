"use client";

import { Sparkles } from "lucide-react";
import { useThemeSettings } from "@/components/providers/ThemeProvider";
import { usePanel } from "@/components/providers/PanelProvider";
import { Button } from "@/components/ui/Button";
import {
  Field,
  Input,
  LockedOverlay,
  PremiumLock,
  SectionCard,
} from "@/components/features/shared";

export function ThemeSettings() {
  const { hasPremium } = usePanel();
  const { theme, setTheme, resetTheme, premiumLocked } = useThemeSettings();

  return (
    <div className="relative">
      <LockedOverlay visible={premiumLocked} title="Tema premium" description="La personalización de colores se desbloquea con EyedPlus+." />
      <SectionCard title="Personalización visual" description="Ajusta colores de acento y brillo del panel." action={<PremiumLock locked={!hasPremium} />}>
        <div className={!hasPremium ? "pointer-events-none opacity-50" : ""}>
          <div className="grid gap-5 md:grid-cols-3">
            <Field label="Acento principal">
              <Input type="color" value={theme.accent} onChange={(event) => setTheme({ accent: event.target.value })} className="h-14 p-2" />
            </Field>
            <Field label="Acento secundario">
              <Input type="color" value={theme.accent2} onChange={(event) => setTheme({ accent2: event.target.value })} className="h-14 p-2" />
            </Field>
            <Field label="Glow">
              <Input type="color" value={theme.panelGlow} onChange={(event) => setTheme({ panelGlow: event.target.value })} className="h-14 p-2" />
            </Field>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={resetTheme}>
              Restaurar paleta
            </Button>
          </div>

          <div className="mt-6 rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(217,70,239,0.2),_rgba(0,0,0,0.15)_55%)] p-6">
            <div className="mb-3 flex items-center gap-2 text-white">
              <Sparkles className="h-5 w-5" />
              Preview del tema
            </div>
            <p className="text-sm text-zinc-300">
              Los colores se aplican mediante variables CSS persistidas en `localStorage`.
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
