"use client";

import type { ReactNode } from "react";
import { Lock, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils";

export function PaneGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">{children}</div>;
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("rounded-[28px] p-6", className)}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {description ? <p className="mt-1 text-sm text-zinc-400">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function PremiumLock({
  locked,
  label = "Premium",
}: {
  locked: boolean;
  label?: string;
}) {
  if (!locked) return <Badge variant="success">Activo</Badge>;
  return (
    <Badge variant="premium" className="gap-1">
      <Lock className="h-3 w-3" />
      {label}
    </Badge>
  );
}

export function LockedOverlay({
  visible,
  title = "Disponible en Premium",
  description = "Activa EyedPlus+ para modificar esta configuración visual o avanzada.",
}: {
  visible: boolean;
  title?: string;
  description?: string;
}) {
  if (!visible) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[28px] border border-fuchsia-400/20 bg-black/55 p-6 backdrop-blur-md">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-fuchsia-500/15 text-fuchsia-100">
          <Sparkles className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm text-zinc-300">{description}</p>
      </div>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  description,
  children,
}: {
  label: string;
  htmlFor?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {description ? <p className="text-xs text-zinc-500">{description}</p> : null}
      {children}
    </div>
  );
}

export function ChannelSelect({
  value,
  onChange,
  options,
  placeholder = "Selecciona un canal",
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; name: string; type?: string }>;
  placeholder?: string;
}) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((channel) => (
        <option key={channel.id} value={channel.id}>
          #{channel.name}
        </option>
      ))}
    </Select>
  );
}

export function FormActions({
  onSave,
  onTest,
  saving,
  testing,
  saveLabel = "Guardar",
  testLabel = "Probar",
  disableSave,
  disableTest,
}: {
  onSave?: () => void;
  onTest?: () => void;
  saving?: boolean;
  testing?: boolean;
  saveLabel?: string;
  testLabel?: string;
  disableSave?: boolean;
  disableTest?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {onSave ? (
        <Button onClick={onSave} loading={saving} disabled={disableSave}>
          {saving ? <Spinner /> : null}
          {saveLabel}
        </Button>
      ) : null}
      {onTest ? (
        <Button
          variant="secondary"
          onClick={onTest}
          loading={testing}
          disabled={disableTest}
        >
          {testing ? <Spinner /> : null}
          {testLabel}
        </Button>
      ) : null}
    </div>
  );
}

export { Button, Input, Label, Select, Textarea };
