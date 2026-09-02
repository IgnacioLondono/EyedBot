import type { ComponentType, ReactNode } from "react";
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
  info: "panel-alert panel-alert-info",
  success: "panel-alert panel-alert-success",
  warning: "panel-alert panel-alert-warning",
  danger: "panel-alert panel-alert-danger",
};

export function Alert({
  title,
  description,
  children,
  variant = "info",
  className,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  variant?: AlertVariant;
  className?: string;
}) {
  const Icon = iconMap[variant];
  return (
    <div className={cn("flex gap-3 rounded-lg border p-4", styleMap[variant], className)}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.75} />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {children ? <div className="panel-alert-desc mt-1 text-sm">{children}</div> : null}
        {!children && description ? <p className="panel-alert-desc mt-1 text-sm">{description}</p> : null}
      </div>
    </div>
  );
}
