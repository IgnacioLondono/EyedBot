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

export function ModuleSidebar({
  search,
  children,
  className,
}: {
  search?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full shrink-0 flex-col gap-3",
        "lg:sticky lg:top-[5.25rem] lg:z-20 lg:w-52 xl:w-56",
        className
      )}
    >
      {search}
      <ModuleNav className="lg:w-full">{children}</ModuleNav>
    </div>
  );
}

export function ModuleNav({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <aside
      className={cn(
        "panel-scroll flex shrink-0 gap-1.5",
        "max-h-[min(38dvh,16rem)] flex-row overflow-x-auto overflow-y-hidden pb-1",
        "lg:max-h-[calc(100dvh-11rem)] lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:pb-0",
        className
      )}
    >
      {children}
    </aside>
  );
}

export function ModuleContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-w-0 w-full flex-1", className)}>{children}</div>;
}

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

export type ChannelFilter = "all" | "text" | "voice" | "category";

function channelMatchesFilter(channel: { type?: string }, filter: ChannelFilter) {
  const type = String(channel.type || "");
  if (filter === "all") return true;
  if (filter === "voice") return type === "2" || type === "13";
  if (filter === "category") return type === "4";
  if (filter === "text") return type === "0" || type === "5";
  return true;
}

function channelOptionLabel(channel: { name: string; type?: string }) {
  const type = String(channel.type || "");
  if (type === "2" || type === "13") return `🔊 ${channel.name}`;
  if (type === "4") return `📁 ${channel.name}`;
  if (type === "5") return `📢 ${channel.name}`;
  return `#${channel.name}`;
}

export function ChannelSelect({
  value,
  onChange,
  options,
  placeholder = "Selecciona un canal",
  filter = "all",
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; name: string; type?: string }>;
  placeholder?: string;
  filter?: ChannelFilter;
}) {
  const filtered = options.filter((channel) => channelMatchesFilter(channel, filter));

  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {filtered.map((channel) => (
        <option key={channel.id} value={channel.id}>
          {channelOptionLabel(channel)}
        </option>
      ))}
    </Select>
  );
}

function roleColorStyle(color?: string) {
  const hex = String(color || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "#99aab5";
  return `#${hex}`;
}

export function RoleSelect({
  value,
  onChange,
  options,
  placeholder = "Selecciona un rol",
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; name: string; color?: string }>;
  placeholder?: string;
}) {
  const selected = options.find((role) => role.id === value);

  return (
    <div className="space-y-2">
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </Select>
      {selected ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span
            className="h-3 w-3 rounded-full border border-white/10"
            style={{ backgroundColor: roleColorStyle(selected.color) }}
          />
          <span>{selected.name}</span>
        </div>
      ) : null}
    </div>
  );
}

export function MultiRoleSelect({
  value,
  onChange,
  options,
  emptyLabel = "No hay roles disponibles.",
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: Array<{ id: string; name: string; color?: string }>;
  emptyLabel?: string;
}) {
  if (!options.length) {
    return <p className="text-sm text-zinc-500">{emptyLabel}</p>;
  }

  function toggle(roleId: string) {
    if (value.includes(roleId)) {
      onChange(value.filter((id) => id !== roleId));
      return;
    }
    onChange([...value, roleId]);
  }

  return (
    <div className="max-h-56 space-y-1 overflow-y-auto rounded-2xl border border-white/8 bg-black/20 p-2">
      {options.map((role) => {
        const checked = value.includes(role.id);
        return (
          <label
            key={role.id}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
              checked ? "bg-violet-500/15 text-white" : "text-zinc-300 hover:bg-white/5"
            )}
          >
      <input
        type="checkbox"
        name={`role-${role.id}`}
        id={`role-${role.id}`}
        checked={checked}
        onChange={() => toggle(role.id)}
        className="accent-violet-500"
      />
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-white/10"
              style={{ backgroundColor: roleColorStyle(role.color) }}
            />
            <span className="truncate">{role.name}</span>
          </label>
        );
      })}
    </div>
  );
}

export function ColorInput({
  value,
  onChange,
  format = "plain",
  placeholder = "7c4dff",
}: {
  value: string;
  onChange: (value: string) => void;
  format?: "plain" | "hash";
  placeholder?: string;
}) {
  const raw = String(value || "").replace("#", "");
  const pickerFallback = format === "hash" ? "#8b5cf6" : "#7c4dff";
  const pickerValue = /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw}` : pickerFallback;
  const displayValue = format === "hash" ? (value.startsWith("#") ? value : raw ? `#${raw}` : "") : raw;

  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        id="embed-color-picker"
        name="embed-color-picker"
        value={pickerValue}
        onChange={(event) => {
          const next = event.target.value;
          onChange(format === "hash" ? next : next.replace("#", ""));
        }}
        className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-white/10 bg-transparent p-1"
        aria-label="Elegir color"
      />
      <Input
        value={displayValue}
        onChange={(event) => {
          const next = event.target.value.trim();
          onChange(format === "hash" ? (next.startsWith("#") ? next : `#${next.replace("#", "")}`) : next.replace("#", ""));
        }}
        placeholder={placeholder}
        className="font-mono text-sm"
      />
    </div>
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
