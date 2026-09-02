"use client";

import Link from "next/link";
import { ChevronRight, Crown, Info, Lightbulb, Sparkles, TriangleAlert } from "lucide-react";
import type { DocArticle, DocBlock } from "@/lib/docs-content";
import { cn } from "@/lib/utils";

function CalloutIcon({ variant }: { variant: "info" | "tip" | "premium" | "warning" }) {
  if (variant === "premium") return <Crown className="h-4 w-4 shrink-0 text-amber-300" />;
  if (variant === "warning") return <TriangleAlert className="h-4 w-4 shrink-0 text-amber-400" />;
  if (variant === "tip") return <Lightbulb className="h-4 w-4 shrink-0 text-cyan-300" />;
  return <Info className="h-4 w-4 shrink-0 text-violet-300" />;
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-violet-200">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function DocBlockView({ block }: { block: DocBlock }) {
  if (block.type === "paragraph") {
    return <p className="text-[15px] leading-7 text-zinc-300">{renderInlineMarkdown(block.text)}</p>;
  }

  if (block.type === "heading") {
    const Tag = block.level === 2 ? "h2" : "h3";
    return (
      <Tag
        className={cn(
          "font-semibold text-white",
          block.level === 2 ? "mt-8 text-xl first:mt-0" : "mt-6 text-lg"
        )}
      >
        {block.text}
      </Tag>
    );
  }

  if (block.type === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag
        className={cn(
          "space-y-2 pl-5 text-[15px] leading-7 text-zinc-300",
          block.ordered ? "list-decimal" : "list-disc marker:text-violet-400/80"
        )}
      >
        {block.items.map((item, i) => (
          <li key={i}>{renderInlineMarkdown(item)}</li>
        ))}
      </ListTag>
    );
  }

  if (block.type === "callout") {
    const styles = {
      info: "border-cyan-500/25 bg-cyan-500/8",
      tip: "border-cyan-500/25 bg-cyan-500/8",
      premium: "border-amber-400/30 bg-amber-500/10",
      warning: "border-amber-500/30 bg-amber-500/8",
    };
    return (
      <div className={cn("flex gap-3 rounded-xl border px-4 py-3", styles[block.variant])}>
        <CalloutIcon variant={block.variant} />
        <div className="min-w-0">
          {block.title ? <p className="text-sm font-medium text-white">{block.title}</p> : null}
          <p className={cn("text-sm text-zinc-300", block.title && "mt-1")}>{block.text}</p>
        </div>
      </div>
    );
  }

  if (block.type === "code") {
    return (
      <pre className="overflow-x-auto rounded-xl border border-white/8 bg-black/40 px-4 py-3 font-mono text-sm text-violet-100">
        <code>{block.code}</code>
      </pre>
    );
  }

  if (block.type === "table") {
    return (
      <div className="overflow-x-auto rounded-xl border border-white/8">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="border-b border-white/8 bg-white/[0.03]">
            <tr>
              {block.headers.map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium text-zinc-300">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri} className="border-b border-white/5 last:border-0">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-4 py-2.5 text-zinc-400">
                    {cell}
                  </td>
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

export function DocsArticleView({ article }: { article: DocArticle }) {
  return (
    <article className="min-w-0 max-w-3xl">
      <header className="mb-8 border-b border-white/8 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">{article.title}</h1>
          {article.premium ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-200">
              <Sparkles className="h-3 w-3" />
              Premium
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-base text-zinc-400">{article.description}</p>
      </header>

      <div className="space-y-4">
        {article.blocks.map((block, i) => (
          <DocBlockView key={i} block={block} />
        ))}
      </div>

      <footer className="mt-10 flex flex-wrap gap-3 border-t border-white/8 pt-6">
        <Link
          href="/docs/getting-started"
          className="inline-flex items-center gap-1 text-sm text-violet-300 hover:text-violet-200"
        >
          Primeros pasos <ChevronRight className="h-4 w-4" />
        </Link>
        <Link href="/commands" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300">
          Ver comandos en vivo
        </Link>
      </footer>
    </article>
  );
}
