"use client";

import { useEffect, useState } from "react";
import {
  CreditCard,
  Save,
  Sparkles,
  Wrench,
} from "lucide-react";
import { getOwnerWebConfig, updateOwnerWebConfig } from "@/lib/api/endpoints";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, SectionCard } from "@/components/features/shared";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { WEB_MODULE_LABELS, WEB_PAGE_LABELS } from "@/lib/web-config";
import type { OwnerWebConfig } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";

type PremiumMode = "env" | "on" | "off";

function premiumModeFromConfig(value: boolean | null | undefined): PremiumMode {
  if (value === true) return "on";
  if (value === false) return "off";
  return "env";
}

function premiumConfigFromMode(mode: PremiumMode): boolean | null {
  if (mode === "on") return true;
  if (mode === "off") return false;
  return null;
}

function ConfigRow({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium text-white">{title}</p>
        {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

export function OwnerWebConfigTab() {
  const { toast } = useToast();
  const [config, setConfig] = useState<OwnerWebConfig | null>(null);
  const [premiumMode, setPremiumMode] = useState<PremiumMode>("env");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getOwnerWebConfig();
      setConfig(data);
      setPremiumMode(premiumModeFromConfig(data.premiumRequired));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      const saved = await updateOwnerWebConfig({
        maintenanceMode: config.maintenanceMode,
        maintenanceMessage: config.maintenanceMessage,
        allowNewLogins: config.allowNewLogins,
        premiumRequired: premiumConfigFromMode(premiumMode),
        billingEnabled: config.billingEnabled,
        pages: config.pages,
        modules: config.modules,
      });
      setConfig(saved);
      setPremiumMode(premiumModeFromConfig(saved.premiumRequired));
      toast({
        title: "Configuración guardada",
        description: "Los cambios de la web ya están activos.",
        tone: "success",
      });
    } catch (err) {
      toast({
        title: "No se pudo guardar",
        description: getErrorMessage(err),
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Alert title="Cargando configuración web" description="Leyendo ajustes del panel." />;
  }

  if (error || !config) {
    return (
      <Alert
        title="No se pudo cargar la configuración"
        description={error || "Respuesta vacía del servidor."}
        variant="danger"
      />
    );
  }

  const envPremium = config.env?.premiumRequired === true;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">
          Activa o desactiva secciones del panel sin reiniciar el servidor.
        </p>
        <Button onClick={() => void save()} loading={saving}>
          <Save className="mr-2 h-4 w-4" />
          Guardar cambios
        </Button>
      </div>

      <SectionCard
        title="Mantenimiento y acceso"
        description="Control global del panel web."
      >
        <div className="space-y-3">
          <ConfigRow
            title="Modo mantenimiento"
            description="Solo el propietario puede usar el panel. El resto verá el aviso de mantenimiento."
            checked={config.maintenanceMode}
            onCheckedChange={(checked) => setConfig((c) => (c ? { ...c, maintenanceMode: checked } : c))}
          />
          <Field label="Mensaje de mantenimiento">
            <Input
              value={config.maintenanceMessage}
              onChange={(event) =>
                setConfig((c) => (c ? { ...c, maintenanceMessage: event.target.value } : c))
              }
              placeholder="El panel está en mantenimiento..."
            />
          </Field>
          <ConfigRow
            title="Permitir nuevos inicios de sesión"
            description="Si lo desactivas, solo cuentas que ya entraron antes (o el owner) podrán acceder."
            checked={config.allowNewLogins}
            onCheckedChange={(checked) => setConfig((c) => (c ? { ...c, allowNewLogins: checked } : c))}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="EyedPlus+ y pagos"
        description="Reglas de premium y checkout."
      >
        <div className="space-y-4">
          <Field label="Exigir EyedPlus+ para módulos premium">
            <Select
              value={premiumMode}
              onChange={(event) => setPremiumMode(event.target.value as PremiumMode)}
            >
              <option value="env">Usar .env ({envPremium ? "activado" : "desactivado"})</option>
              <option value="on">Siempre exigir Plus</option>
              <option value="off">No exigir Plus</option>
            </Select>
          </Field>
          <p className="text-xs text-zinc-500">
            Efectivo ahora:{" "}
            <span className="text-zinc-300">
              {config.effective?.premiumRequired ? "Plus requerido" : "Plus opcional"}
            </span>
            {config.env?.billingProvider ? (
              <> · Proveedor de pago: {config.env.billingProvider}</>
            ) : null}
          </p>
          <ConfigRow
            title="Pagos habilitados"
            description="Permite crear sesiones de checkout (WebPay / Mercado Pago)."
            checked={config.billingEnabled}
            onCheckedChange={(checked) => setConfig((c) => (c ? { ...c, billingEnabled: checked } : c))}
          />
        </div>
      </SectionCard>

      <SectionCard title="Páginas del panel" description="Visibilidad en la navegación principal.">
        <div className="grid gap-3 md:grid-cols-2">
          {(Object.keys(WEB_PAGE_LABELS) as Array<keyof typeof WEB_PAGE_LABELS>).map((key) => (
            <ConfigRow
              key={key}
              title={WEB_PAGE_LABELS[key]}
              checked={config.pages[key] !== false}
              onCheckedChange={(checked) =>
                setConfig((c) =>
                  c ? { ...c, pages: { ...c.pages, [key]: checked } } : c
                )
              }
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Módulos por servidor" description="Oculta paneles y bloquea su API si están desactivados.">
        <div className="grid gap-3 md:grid-cols-2">
          {(Object.keys(WEB_MODULE_LABELS) as Array<keyof typeof WEB_MODULE_LABELS>).map((key) => (
            <ConfigRow
              key={key}
              title={WEB_MODULE_LABELS[key]}
              checked={config.modules[key] !== false}
              onCheckedChange={(checked) =>
                setConfig((c) =>
                  c ? { ...c, modules: { ...c.modules, [key]: checked } } : c
                )
              }
            />
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Wrench, label: "Mantenimiento", on: config.maintenanceMode },
          { icon: Sparkles, label: "Plus efectivo", on: config.effective?.premiumRequired },
          { icon: CreditCard, label: "Pagos", on: config.billingEnabled },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3"
          >
            <item.icon className="h-5 w-5 text-fuchsia-300" />
            <div>
              <p className="text-xs text-zinc-500">{item.label}</p>
              <p className="text-sm font-medium text-white">{item.on ? "Activo" : "Inactivo"}</p>
            </div>
          </div>
        ))}
      </div>

      {config.updatedAt ? (
        <p className="text-xs text-zinc-600">
          Última actualización: {new Date(config.updatedAt).toLocaleString("es-CL")}
          {config.updatedBy ? ` · por ${config.updatedBy}` : ""}
        </p>
      ) : null}
    </div>
  );
}
