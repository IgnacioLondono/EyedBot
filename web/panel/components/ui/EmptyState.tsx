import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  premium?: boolean;
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  premium,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("panel-empty", className)}>
      {icon ? <div className="panel-icon-box mx-auto mb-4 h-14 w-14">{icon}</div> : null}
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2">
          <h3 className="text-base font-semibold text-[var(--foreground)]">{title}</h3>
          {premium ? <Badge variant="premium">Premium</Badge> : null}
        </div>
        <p className="panel-muted mx-auto max-w-lg text-sm">{description}</p>
      </div>
      {actionLabel && onAction ? (
        <div className="mt-5">
          <Button variant="secondary" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
