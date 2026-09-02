"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { getCommands } from "@/lib/api/endpoints";
import type { CommandCatalogItem } from "@/lib/types";
import { commandCategoryLabel, sortCommandCategories } from "@/lib/command-categories";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export function DocsCommandsCatalog() {
  const [commands, setCommands] = useState<CommandCatalogItem[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getCommands()
      .then(setCommands)
      .catch(() => setCommands([]))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const set = new Set(commands.map((c) => (c.category || "other").toLowerCase()));
    return ["all", ...sortCommandCategories(Array.from(set))];
  }, [commands]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return commands.filter((cmd) => {
      const cat = (cmd.category || "other").toLowerCase();
      if (category !== "all" && cat !== category) return false;
      if (!q) return true;
      return `${cmd.name} ${cmd.description || ""} ${commandCategoryLabel(cat)}`.toLowerCase().includes(q);
    });
  }, [commands, query, category]);

  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold text-white">Catálogo en vivo</h2>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar comando…"
            className="pl-10"
          />
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="sm:min-w-[200px]">
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {commandCategoryLabel(cat)}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Cargando comandos…</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-zinc-500">
            {filtered.length} de {commands.length} comandos
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {filtered.map((cmd) => (
              <Card key={cmd.name} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <code className="text-violet-300">/{cmd.name}</code>
                  <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">
                    {commandCategoryLabel(cmd.category)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-400">{cmd.description || "Sin descripción"}</p>
              </Card>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
