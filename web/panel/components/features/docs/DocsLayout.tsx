"use client";

import { usePathname } from "next/navigation";
import { findDocArticle } from "@/lib/docs-content";
import { DocsArticleView } from "@/components/features/docs/DocsArticle";
import { DocsCommandsCatalog } from "@/components/features/docs/DocsCommandsCatalog";

function slugFromPathname(pathname: string) {
  if (pathname === "/docs" || pathname === "/docs/") return "introduction";
  return pathname.replace(/^\/docs\/?/, "").trim() || "introduction";
}

export function DocsLayout() {
  const pathname = usePathname();
  const slug = slugFromPathname(pathname);
  const article = findDocArticle(slug);

  if (!article) {
    return (
      <div className="docs-content-shell">
        <p className="text-zinc-400">Artículo no encontrado.</p>
      </div>
    );
  }

  return (
    <div className="docs-content-shell">
      <DocsArticleView article={article} />
      {slug === "commands" ? (
        <div className="mt-10 border-t border-white/[0.06] pt-10">
          <DocsCommandsCatalog />
        </div>
      ) : null}
    </div>
  );
}
