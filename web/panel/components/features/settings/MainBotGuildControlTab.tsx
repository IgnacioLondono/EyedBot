"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Server } from "lucide-react";
import {
  getMainBotGuildControl,
  updateMainBotGuildControl,
  type MainBotGuildControl,
} from "@/lib/api/endpoints";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { Input } from "@/components/ui/Input";
import { SectionCard } from "@/components/features/shared";
import { asArray, asRecord, formatDate, getErrorMessage, toStringValue } from "@/lib/utils";

function isDisabled(control: MainBotGuildControl) {
  return (
    control.commandsDisabled === true &&
    control.dataCollectionDisabled === true &&
    control.hiddenFromPanel === true
  );
}

export function MainBotGuildControlTab() {
  const { toast } = useToast();
  const [guilds, setGuilds] = useState<MainBotGuildControl[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyGuildId, setBusyGuildId] = useState<string | null>(null);

  async function loadAll() {
    setRefreshing(true);
    setError(null);
    try {
      const data = await getMainBotGuildControl();
      setGuilds(asArray(data.guilds).map((entry) => {
        const row = asRecord(entry);
        return {
          guildId: toStringValue(row.guildId),
          name: toStringValue(row.name, "Servidor"),
          memberCount: row.memberCount == null ? null : Number(row.memberCount),
          iconUrl: toStringValue(row.iconUrl) || null,
          commandsDisabled: row.commandsDisabled === true,
          dataCollectionDisabled: row.dataCollectionDisabled === true,
          hiddenFromPanel: row.hiddenFromPanel === true,
          updatedAt: toStringValue(row.updatedAt) || null,
          updatedBy: toStringValue(row.updatedBy) || null,
        };
      }));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const filteredGuilds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guilds;
    return guilds.filter(
      (guild) => guild.name.toLowerCase().includes(q) || guild.guildId.includes(q)
    );
  }, [guilds, query]);

  async function applyPatch(guildId: string, patch: Record<string, boolean>) {
    setBusyGuildId(guildId);
    try {
      const response = await updateMainBotGuildControl(guildId, patch);
      setGuilds((current) =>
        current.map((guild) =>
          guild.guildId === guildId
            ? {
                ...guild,
                ...patch,
                updatedAt: new Date().toISOString(),
              }
            : guild
        )
      );
      const applied = response?.applied ?? null;
      if (applied && applied.applied === false) {
        toast({
          title: "Ajuste guardado, sin aplicar en Discord",
          description:
            applied.reason || "El estado se guardó pero no se pudo recargar en el servidor de Discord.",
          tone: "danger",
        });
      } else {
        toast({
          title: "Control de servidor actualizado",
          description: "Los cambios se guardaron y se aplicaron al servidor de Discord.",
          tone: "success",
        });
      }
    } catch (err) {
      toast({
        title: "No se pudo actualizar",
        description: getErrorMessage(err),
        tone: "danger",
      });
    } finally {
      setBusyGuildId(null);
    }
  }

  function toggleMaster(guild: MainBotGuildControl, next: boolean) {
    return void applyPatch(guild.guildId, {
      disabled: next,
    });
  }

  function toggleFlag(guild: MainBotGuildControl, key: "commandsDisabled" | "dataCollectionDisabled" | "hiddenFromPanel") {
    return void applyPatch(guild.guildId, { [key]: !guild[key] });
  }

  if (loading) {
    return <Alert title="Cargando servidores" description="Consultando el control por servidor del bot principal." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            Control del bot principal por servidor
          </h2>
          <p className="mt-1 text-sm text-[var(--theme-text-secondary)]">
            Desactiva comandos, recolección de datos u oculta servidores en el panel. Solo afecta a EyedBot (el bot
            principal), nunca a los bots auxiliares.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void loadAll()} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {error ? (
        <Alert title="No se pudieron cargar los servidores" description={error} variant="danger" />
      ) : null}

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar servidor…"
          className="pl-10"
        />
      </div>

      {!filteredGuilds.length ? (
        <SectionCard title="Sin servidores" description="No hay servidores que coincidan con la búsqueda.">
          <Alert title="Sin resultados" description="Cambia el filtro o verifica que el bot esté en algún servidor." />
        </SectionCard>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filteredGuilds.map((guild) => {
            const disabled = isDisabled(guild);
            return (
              <div
                key={guild.guildId}
                className={`rounded-2xl border p-4 transition-colors ${
                  disabled ? "border-red-500/40 bg-red-500/5" : "border-white/8 bg-black/20"
                }`}
              >
                <div className="flex items-start gap-3">
                  {guild.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={guild.iconUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800">
                      <Server className="h-5 w-5 text-zinc-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-white">{guild.name}</p>
                      {disabled ? <Badge variant="danger">Desactivado</Badge> : <Badge variant="default">Activo</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      ID ···{guild.guildId.slice(-4)}
                      {guild.memberCount != null ? ` · ${guild.memberCount.toLocaleString("es-ES")} miembros` : ""}
                    </p>
                    {guild.updatedAt ? (
                      <p className="mt-0.5 text-xs text-zinc-600">
                        Cambiado: {formatDate(guild.updatedAt)}
                        {guild.updatedBy ? ` · por ${guild.updatedBy}` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                      <Switch
                        checked={guild.commandsDisabled}
                        onCheckedChange={() => toggleFlag(guild, "commandsDisabled")}
                        disabled={busyGuildId === guild.guildId}
                      />
                      Comandos
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                      <Switch
                        checked={guild.dataCollectionDisabled}
                        onCheckedChange={() => toggleFlag(guild, "dataCollectionDisabled")}
                        disabled={busyGuildId === guild.guildId}
                      />
                      Datos
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                      <Switch
                        checked={guild.hiddenFromPanel}
                        onCheckedChange={() => toggleFlag(guild, "hiddenFromPanel")}
                        disabled={busyGuildId === guild.guildId}
                      />
                      Ocultar en panel
                    </label>
                  </div>
                  <Button
                    variant={disabled ? "secondary" : "danger"}
                    size="sm"
                    disabled={busyGuildId === guild.guildId}
                    onClick={() => toggleMaster(guild, !disabled)}
                  >
                    {disabled ? "Reactivar servidor" : "Desactivar todo"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}