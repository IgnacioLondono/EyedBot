"use client";

import Link from "next/link";
import { Crown } from "lucide-react";
import { DOCS_NAV, docsHref } from "@/lib/docs-content";
import { cn } from "@/lib/utils";

export function DocsSidebarNav({
  slug,
  query,
}: {
  slug: string;
  query: string;
}) {
  const q = query.trim().toLowerCase();
  const groups = q
    ? DOCS_NAV.map((group) => ({
        ...group,
        items: group.items.filter((item) => item.title.toLowerCase().includes(q)),
      })).filter((g) => g.items.length > 0)
    : DOCS_NAV;

  return (
    <nav className="space-y-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="nav-section-label">{group.label}</p>
          <div className="mt-1 space-y-0.5">
            {group.items.map((item) => {
              const active = item.slug === slug;
              return (
                <Link
                  key={item.slug}
                  href={docsHref(item.slug)}
                  className={cn("nav-item-docs", active && "nav-item-docs-active")}
                >
                  <span className="truncate">{item.title}</span>
                  {item.premium ? (
                    <Crown className="ml-auto h-3.5 w-3.5 shrink-0 text-amber-400/90" />
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      {!groups.length ? <p className="px-2 py-2 text-sm text-zinc-500">Sin resultados</p> : null}
    </nav>
  );
}
