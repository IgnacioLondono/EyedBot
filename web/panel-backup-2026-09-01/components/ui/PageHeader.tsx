import type { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {kicker ? (
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300/80">{kicker}</p>
        ) : null}
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-zinc-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
