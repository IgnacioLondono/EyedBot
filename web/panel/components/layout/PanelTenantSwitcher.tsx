"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, ChevronDown, Loader2 } from "lucide-react";
import { usePanel } from "@/components/providers/PanelProvider";
import { cn } from "@/lib/utils";

export function PanelTenantSwitcher() {
  const router = useRouter();
  const { bootstrap, selectTenant } = usePanel();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const tenants = useMemo(() => {
    const list = Array.isArray(bootstrap?.assignedTenants) ? bootstrap.assignedTenants : [];
    const current = bootstrap?.tenant;
    if (current && !list.some((t) => t.id === current.id)) {
      return [current, ...list];
    }
    return list;
  }, [bootstrap?.assignedTenants, bootstrap?.tenant]);

  const currentId = bootstrap?.tenant?.id || "";
  const currentLabel = bootstrap?.tenant
    ? bootstrap.tenant.brand?.name || bootstrap.tenant.label || "Bot asignado"
    : "EyedBot";

  if (!bootstrap?.user) return null;
  if (!tenants.length && !bootstrap.tenant) return null;

  async function switchTo(botId: string | null) {
    if (busy) return;
    const nextId = botId || "";
    if (nextId === currentId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await selectTenant(botId);
      setOpen(false);
      router.push("/dashboard");
      router.refresh();
    } catch {
      /* refresh/toast handled upstream if needed */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-[11rem] items-center gap-1.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-strong)] px-2.5 py-2 text-sm text-[var(--foreground)] hover:bg-[color-mix(in_srgb,var(--foreground)_4%,var(--color-surface-strong))] disabled:opacity-60 sm:max-w-[14rem]"
        title="Cambiar de panel"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[color:var(--color-icon-muted)]" strokeWidth={1.75} />
        ) : (
          <Bot className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-icon-muted)]" strokeWidth={1.75} />
        )}
        <span className="truncate">{currentLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-icon-muted)]" strokeWidth={1.75} />
      </button>

      {open ? (
        <div className="panel-popover panel-scroll absolute left-0 z-50 mt-2 max-h-72 w-56 overflow-y-auto p-1 sm:left-auto sm:right-0">
          <p className="panel-muted px-3 py-1.5 text-[10px] uppercase tracking-wide">Panel activo</p>
          <button
            type="button"
            className={cn("panel-popover-item", !currentId && "panel-popover-item-active")}
            onClick={() => void switchTo(null)}
          >
            <span>EyedBot</span>
            {!currentId ? <Check className="h-3.5 w-3.5 text-[color:var(--color-accent)]" strokeWidth={1.75} /> : null}
          </button>
          {tenants.map((tenant) => {
            const label = tenant.brand?.name || tenant.label || tenant.slug || "Bot";
            const active = currentId === tenant.id;
            return (
              <button
                key={tenant.id}
                type="button"
                className={cn("panel-popover-item", active && "panel-popover-item-active")}
                onClick={() => void switchTo(tenant.id)}
              >
                <span className="truncate">{label}</span>
                {active ? <Check className="h-3.5 w-3.5 text-[color:var(--color-accent)]" strokeWidth={1.75} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
