import type { ComponentType } from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type AlertVariant = "info" | "success" | "warning" | "danger";

const iconMap = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: ShieldAlert,
} satisfies Record<AlertVariant, ComponentType<{ className?: string }>>;

const styleMap: Record<AlertVariant, string> = {
  info: "border-cyan-400/20 bg-cyan-500/10 text-cyan-50",
  success: "border-emerald-400/20 bg-emerald-500/10 text-emerald-50",
  warning: "border-amber-400/20 bg-amber-500/10 text-amber-50",
  danger: "border-red-400/20 bg-red-500/10 text-red-50",
};

export function Alert({
  title,
  description,
  variant = "info",
  className,
}: {
  title: string;
  description?: string;
  variant?: AlertVariant;
  className?: string;
}) {
  const Icon = iconMap[variant];
  return (
    <div className={cn("flex gap-3 rounded-2xl border p-4", styleMap[variant], className)}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        {description ? <p className="mt-1 text-sm/6 opacity-80">{description}</p> : null}
      </div>
    </div>
  );
}
