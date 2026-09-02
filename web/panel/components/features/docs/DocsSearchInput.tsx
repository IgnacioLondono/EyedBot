"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

export function DocsSearchInput({
  value,
  onChange,
  id = "docs-search",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar…"
        className="docs-search-input h-9 border-white/[0.06] bg-[#141418] pl-9 pr-14 text-sm"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-zinc-500 sm:inline">
        Ctrl K
      </kbd>
    </div>
  );
}
