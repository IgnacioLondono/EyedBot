"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Sparkles } from "lucide-react";
import {
  DOCS_DEFAULT_SLUG,
  DOCS_NAV,
  docsHref,
  findDocArticle,
  flattenDocsNav,
} from "@/lib/docs-content";
import { DocsArticleView } from "@/components/features/docs/DocsArticle";
import { DocsCommandsCatalog } from "@/components/features/docs/DocsCommandsCatalog";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

function slugFromPathname(pathname: string) {
  if (pathname === "/docs" || pathname === "/docs/") return DOCS_DEFAULT_SLUG;
  const rest = pathname.replace(/^\/docs\/?/, "").trim();
  return rest || DOCS_DEFAULT_SLUG;
}

export function DocsLayout({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  const slug = slugFromPathname(pathname);
  const article = findDocArticle(slug);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("docs-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filteredNav = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DOCS_NAV;
    return DOCS_NAV.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.title.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  const flatItems = flattenDocsNav();

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <aside className="glass-panel w-full shrink-0 overflow-hidden rounded-2xl lg:sticky lg:top-6 lg:w-64 xl:w-72">
        <div className="border-b border-white/6 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              id="docs-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar docs…"
              className="h-9 pl-9 text-sm"
            />
          </div>
          <p className="mt-2 hidden text-[10px] text-zinc-600 lg:block">Ctrl K</p>
        </div>

        <nav className="panel-scroll max-h-[min(70dvh,32rem)] space-y-4 overflow-y-auto p-3 lg:max-h-[calc(100dvh-12rem)]">
          {filteredNav.map((group) => (
            <div key={group.label}>
              <p className="nav-section-label">{group.label}</p>
              <div className="mt-1 space-y-0.5">
                {group.items.map((item) => {
                  const active = item.slug === slug;
                  return (
                    <Link
                      key={item.slug}
                      href={docsHref(item.slug)}
                      className={cn("nav-item text-sm", active && "nav-item-active")}
                    >
                      <span className="truncate">{item.title}</span>
                      {item.premium ? (
                        <Sparkles className="ml-auto h-3 w-3 shrink-0 text-amber-300/90" />
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          {!filteredNav.length ? (
            <p className="px-2 py-4 text-sm text-zinc-500">Sin resultados para «{query}»</p>
          ) : null}
        </nav>

        <div className="border-t border-white/6 px-3 py-2 text-xs text-zinc-600">
          {flatItems.length} artículos
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {children}
        {!children && article ? (
          <>
            <DocsArticleView article={article} />
            {slug === "commands" ? (
              <div className="mt-8">
                <DocsCommandsCatalog />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
