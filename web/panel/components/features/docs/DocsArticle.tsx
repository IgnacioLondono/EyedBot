"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight, Crown, Info, Lightbulb, Sparkles, TriangleAlert } from "lucide-react";
import type { DocArticle, DocBlock } from "@/lib/docs-content";
import { cn } from "@/lib/utils";

function CalloutIcon({ variant }: { variant: "info" | "tip" | "premium" | "warning" }) {
  if (variant === "premium") return <Crown className="h-4 w-4 shrink-0 text-amber-300" />;
  if (variant === "warning") return <TriangleAlert className="h-4 w-4 shrink-0 text-amber-400" />;
  if (variant === "tip") return <Lightbulb className="h-4 w-4 shrink-0 text-teal-300" />;
  return <Info className="h-4 w-4 shrink-0 text-teal-300" />;
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-violet-300">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function DocBlockView({ block }: { block: DocBlock }) {
  if (block.type === "paragraph") {
    return <p className="docs-prose">{renderInlineMarkdown(block.text)}</p>;
  }

  if (block.type === "heading") {
    const Tag = block.level === 2 ? "h2" : "h3";
    return (
      <Tag className={cn("docs-heading", block.level === 2 ? "docs-h2" : "docs-h3")}>
        {block.text}
      </Tag>
    );
  }

  if (block.type === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag className={cn("docs-list", block.ordered && "docs-list-ordered")}>
        {block.items.map((item, i) => (
          <li key={i}>{renderInlineMarkdown(item)}</li>
        ))}
      </ListTag>
    );
  }

  if (block.type === "callout") {
    const styles = {
      info: "docs-callout-info",
      tip: "docs-callout-info",
      premium: "docs-callout-premium",
      warning: "docs-callout-warning",
    };
    return (
      <div className={cn("docs-callout", styles[block.variant])}>
        <CalloutIcon variant={block.variant} />
        <div className="min-w-0">
          {block.title ? <p className="text-sm font-medium text-white">{block.title}</p> : null}
          <p className={cn("text-sm leading-relaxed text-zinc-300", block.title && "mt-1")}>{block.text}</p>
        </div>
      </div>
    );
  }

  if (block.type === "code") {
    return (
      <pre className="docs-code">
        <code>{block.code}</code>
      </pre>
    );
  }

  if (block.type === "table") {
    return (
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              {block.headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}

function NewHereBanner() {
  const [open, setOpen] = useState(false);

  return (
    <div className="docs-new-here">
      <button type="button" onClick={() => setOpen((v) => !v)} className="docs-new-here-trigger">
        <Lightbulb className="h-4 w-4 text-teal-300" />
        <span className="font-medium text-teal-100">¿Nuevo aquí?</span>
        <ChevronDown className={cn("ml-auto h-4 w-4 text-teal-300/80 transition", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="docs-new-here-body">
          <p className="text-sm leading-relaxed text-zinc-300">
            Empieza por{" "}
            <Link href="/docs/getting-started" className="text-violet-300 hover:text-violet-200">
              Primeros pasos
            </Link>{" "}
            para invitar el bot y configurar tu primer módulo. Luego explora cada plugin en la barra lateral.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function DocsArticleView({ article }: { article: DocArticle }) {
  const isIntro = article.slug === "introduction";

  return (
    <article className="docs-article">
      <header className="docs-article-header">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="docs-page-title">{article.title}</h1>
          {article.premium ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/12 px-2 py-0.5 text-xs font-medium text-amber-200">
              <Sparkles className="h-3 w-3" />
              Premium
            </span>
          ) : null}
        </div>
        <p className="docs-page-lead">{article.description}</p>
      </header>

      {isIntro ? <NewHereBanner /> : null}

      <div className="docs-blocks">
        {article.blocks.map((block, i) => (
          <DocBlockView key={i} block={block} />
        ))}
      </div>

      <footer className="docs-footer">
        <Link href="/docs/getting-started" className="docs-footer-link">
          Primeros pasos <ChevronRight className="h-4 w-4" />
        </Link>
        <Link href="/commands" className="text-sm text-zinc-500 hover:text-zinc-300">
          Ver comandos en vivo
        </Link>
      </footer>
    </article>
  );
}
