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
    <div className={cn("rounded-3xl border border-dashed border-white/12 bg-white/4 p-8 text-center", className)}>
      {icon ? <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/8 text-zinc-200">{icon}</div> : null}
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {premium ? <Badge variant="premium">Premium</Badge> : null}
        </div>
        <p className="mx-auto max-w-lg text-sm text-zinc-400">{description}</p>
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
