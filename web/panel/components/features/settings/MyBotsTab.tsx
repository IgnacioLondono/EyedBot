"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Save, UserPlus } from "lucide-react";
import {
  getMyBots,
  updateOwnerBotAvatar,
  updateOwnerBotBanner,
  updateOwnerBotProfile,
} from "@/lib/api/endpoints";
import { useToast } from "@/components/providers/ToastProvider";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, SectionCard, Textarea } from "@/components/features/shared";
import { asRecord, getErrorMessage, toStringValue } from "@/lib/utils";

type MyBot = {
  id: string;
  slug: string;
  label: string;
  description: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  username: string;
  applicationId: string;
  panelPath: string;
  status: string;
  enabled: boolean;
  panelEnabled: boolean;
};

function parseBot(raw: unknown): MyBot {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    id: toStringValue(row.id),
    slug: toStringValue(row.slug),
    label: toStringValue(row.label),
    description: toStringValue(row.description || "") || "",
    avatarUrl: toStringValue(row.avatarUrl) || null,
    bannerUrl: toStringValue(row.bannerUrl) || null,
    username: toStringValue(row.username || "") || "",
    applicationId: toStringValue(row.applicationId || "") || "",
    panelPath: toStringValue(row.panelPath || "") || "",
    status: toStringValue(row.status || "offline") || "offline",
    enabled: row.enabled !== false,
    panelEnabled: row.panelEnabled === true,
  };
}

function renderStatus(status: string, enabled: boolean) {
  if (!enabled) return <Badge variant="default">Detenido</Badge>;
  if (status === "online") return <Badge variant="success">En linea</Badge>;
  if (status === "starting") return <Badge variant="warning">Conectando...</Badge>;
  if (status === "error") return <Badge variant="danger">Error</Badge>;
  return <Badge variant="default">Desconectado</Badge>;
}

export function MyBotsTab() {
  const { toast } = useToast();
  const [bots, setBots] = useState<MyBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  async function loadBots() {
    setLoading(true);
    try {
      const data = await getMyBots();
      setBots(((asRecord(data).bots as unknown[]) || []).map(parseBot));
    } catch (err) {
      toast({ title: "No se pudieron cargar tus bots", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBots();
  }, []);

  const selectedBot = bots.find((b) => b.id === selectedBotId) || null;

  function handleSelectBot(botId: string) {
    const bot = bots.find((b) => b.id === botId);
    if (!bot) return;
    setSelectedBotId(botId);
    setEditDescription(bot.description);
  }

  async function uploadImage(type: "avatar" | "banner", file: File) {
    if (!selectedBotId) return;
    setBusy(type);
    try {
      const form = new FormData();
      form.append(type, file);
      const data =
        type === "avatar"
          ? await updateOwnerBotAvatar(selectedBotId, form)
          : await updateOwnerBotBanner(selectedBotId, form);
      const updated = parseBot(asRecord(data).bot);
      setBots((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      toast({
        title: type === "avatar" ? "Avatar actualizado" : "Banner actualizado",
        tone: "success",
      });
    } catch (err) {
      toast({ title: type === "avatar" ? "Avatar" : "Banner", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  function handleFileSelect(file: File | null, type: "avatar" | "banner") {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Solo imagenes", description: "El archivo debe ser una imagen (PNG, JPG, WebP, GIF).", tone: "danger" });
      return;
    }
    void uploadImage(type, file);
  }

  async function handleSaveDescription() {
    if (!selectedBotId) return;
    setBusy("description");
    try {
      const data = await updateOwnerBotProfile(selectedBotId, { description: editDescription });
      const updated = parseBot(asRecord(data).bot);
      setBots((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      toast({ title: "Descripcion guardada", tone: "success" });
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <Alert title="Cargando tus bots" description="Consultando bots asignados a tu cuenta." />;
  }

  if (bots.length === 0) {
    return (
      <Alert
        title="Sin bots asignados"
        description="No tienes bots asignados a tu cuenta. Contacta al propietario para que te asigne uno."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
        <span>Mis bots asignados ({bots.length})</span>
      </div>

      <div className="flex flex-wrap gap-5">
        <SectionCard title="Tus bots" description="Bots asignados a tu cuenta de Discord.">
          <div className="space-y-2">
            {bots.map((bot) => (
              <button
                key={bot.id}
                type="button"
                onClick={() => handleSelectBot(bot.id)}
                className={
                  "panel-list-item flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left " +
                  (selectedBotId === bot.id ? "panel-list-item-active" : "")
                }
              >
                {bot.avatarUrl ? (
                  <img src={bot.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="panel-icon-box flex h-10 w-10 rounded-full">
                    <span className="text-2xl">B</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{bot.label}</p>
                  <p className="panel-muted truncate text-xs">
                    {bot.username || "Sin nombre"} - {renderStatus(bot.status, bot.enabled)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </SectionCard>

        {selectedBot ? (
          <div className="min-w-0 flex-1 space-y-5">
            <SectionCard title={selectedBot.label} description="Foto de perfil, banner y descripcion del bot.">
              <div className="relative mb-4 overflow-hidden rounded-2xl border border-white/10">
                {selectedBot.bannerUrl ? (
                  <img src={selectedBot.bannerUrl} alt="" className="h-24 w-full object-cover" />
                ) : (
                  <div className="flex h-24 w-full items-center justify-center bg-white/5 text-xs text-zinc-400">
                    Sin banner
                  </div>
                )}
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files?.[0] || null, "banner")}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute bottom-2 right-2"
                  disabled={busy === "banner" || selectedBot.status !== "online"}
                  onClick={() => bannerInputRef.current?.click()}
                >
                  <ImagePlus className="mr-1 h-3.5 w-3.5" />
                  {busy === "banner" ? "Subiendo..." : "Cambiar banner"}
                </Button>
              </div>

              <div className="flex flex-wrap items-start gap-4">
                <div>
                  {selectedBot.avatarUrl ? (
                    <img src={selectedBot.avatarUrl} alt="" className="h-20 w-20 rounded-2xl object-cover" />
                  ) : (
                    <div className="panel-icon-box flex h-20 w-20 rounded-2xl">
                      <span className="text-4xl">B</span>
                    </div>
                  )}
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e.target.files?.[0] || null, "avatar")}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2 w-full"
                    disabled={busy === "avatar" || selectedBot.status !== "online"}
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <ImagePlus className="mr-1 h-3.5 w-3.5" />
                    {busy === "avatar" ? "Subiendo..." : "Cambiar avatar"}
                  </Button>
                </div>

                <div className="min-w-0 flex-1">
                  <Field label="Descripcion" description="Descripcion publica del bot (max. 400 caracteres).">
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Descripcion del bot..."
                      rows={4}
                      maxLength={400}
                    />
                  </Field>
                  <Button
                    size="sm"
                    disabled={busy === "description" || selectedBot.status !== "online"}
                    onClick={handleSaveDescription}
                  >
                    {busy === "description" ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-1 h-4 w-4" />
                    )}
                    Guardar descripcion
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                <span>ID: {selectedBot.id}</span>
              </div>
              {selectedBot.panelPath ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  onClick={() => window.open(selectedBot.panelPath, "_blank", "noopener,noreferrer")}
                >
                  <UserPlus className="mr-1 h-4 w-4" />
                  Ver panel /t/{selectedBot.slug}
                </Button>
              ) : null}
            </SectionCard>
          </div>
        ) : (
          <Alert
            title="Selecciona un bot"
            description="Haz clic en un bot de la lista para editar su avatar, banner y descripcion."
          />
        )}
      </div>
    </div>
  );
}