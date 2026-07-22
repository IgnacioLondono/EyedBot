"use client";

import { useMemo, useState } from "react";
import { Pencil, RotateCcw, Save, ShoppingBag, Trash2, X } from "lucide-react";
import {
  banGachaCatalogItem,
  deleteGachaCatalogItem,
  gachaCatalogImageUrl,
  saveGachaCatalogItem,
  uploadGachaCatalogImage,
} from "@/lib/api/endpoints";
import { useToast } from "@/components/providers/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { EmbedImageField } from "@/components/features/embed/EmbedImageField";
import { Field, Input, Select, Textarea } from "@/components/features/shared";
import { CommunityShopProductsPanel } from "@/components/features/server/panes/CommunityShopProductsPanel";
import { getErrorMessage, toBooleanValue, toNumberValue, toStringValue } from "@/lib/utils";

type ShopItem = Record<string, unknown>;

type ShopEditState = {
  name: string;
  series: string;
  description: string;
  rarity: string;
  shopPrice: string;
  shopHidden: boolean;
  catalogRemoved: boolean;
  imageUrl: string;
};

const CATEGORY_OPTIONS = [
  { value: "personajes", label: "Personajes" },
  { value: "roles", label: "Roles" },
  { value: "objetos", label: "Objetos" },
  { value: "boosts", label: "Boosts" },
  { value: "eventos", label: "Eventos" },
  { value: "cosmeticos", label: "Cosméticos" },
  { value: "general", label: "General" },
];

function itemToEditState(item: ShopItem): ShopEditState {
  const overridePrice = item.shopPriceOverride;
  return {
    name: toStringValue(item.name),
    series: toStringValue(item.series),
    description: toStringValue(item.description),
    rarity: toStringValue(item.rarity, "N").toUpperCase(),
    shopPrice: overridePrice !== undefined && overridePrice !== null ? String(overridePrice) : "",
    shopHidden: toBooleanValue(item.shopHidden),
    catalogRemoved: toBooleanValue(item.catalogRemoved),
    imageUrl: toStringValue(item.imageUrl),
  };
}

function resolveShopImage(item: ShopItem, guildId: string, cacheToken: number) {
  if (toBooleanValue(item.catalogDbImage)) {
    return gachaCatalogImageUrl(guildId, toStringValue(item.id), cacheToken > 0);
  }
  const remote = toStringValue(item.imageUrl);
  if (/^https?:\/\//i.test(remote)) return remote;
  return "";
}

function categorySelectValue(series: string) {
  const normalized = series.trim().toLowerCase();
  if (CATEGORY_OPTIONS.some((option) => option.value === normalized)) return normalized;
  return "__custom__";
}

export function GachaShopPanel({
  guildId,
  items,
  premiumLocked,
  onReload,
}: {
  guildId: string;
  items: ShopItem[];
  premiumLocked: boolean;
  onReload: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [editingItem, setEditingItem] = useState<ShopItem | null>(null);
  const [editForm, setEditForm] = useState<ShopEditState | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [imageCacheToken, setImageCacheToken] = useState(0);
  const [query, setQuery] = useState("");

  const editingId = editingItem ? toStringValue(editingItem.id) : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const haystack = [
        toStringValue(item.name),
        toStringValue(item.series),
        toStringValue(item.id),
        toStringValue(item.rarity),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, query]);

  function startEdit(item: ShopItem) {
    setEditingItem(item);
    setEditForm(itemToEditState(item));
  }

  function cancelEdit() {
    setEditingItem(null);
    setEditForm(null);
  }

  async function handleSave(characterId: string) {
    if (!editForm) return;
    setSavingId(characterId);
    try {
      const body: Record<string, unknown> = {
        name: editForm.name,
        series: editForm.series,
        description: editForm.description,
        rarity: editForm.rarity,
        shopHidden: editForm.shopHidden,
        removedFromGuildCatalog: editForm.catalogRemoved,
        restoreToGuildCatalog: !editForm.catalogRemoved,
      };
      if (editForm.shopPrice.trim()) {
        body.shopPrice = Number.parseInt(editForm.shopPrice, 10);
      } else {
        body.clearShopPrice = true;
      }
      if (editForm.imageUrl.trim()) {
        body.imageUrl = editForm.imageUrl.trim();
      }
      await saveGachaCatalogItem(guildId, characterId, body);
      toast({ title: "Objeto actualizado", description: "Los cambios de la tienda quedaron guardados.", tone: "success" });
      cancelEdit();
      await onReload();
    } catch (err) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSavingId(null);
    }
  }

  async function handleReset(characterId: string) {
    setSavingId(characterId);
    try {
      await deleteGachaCatalogItem(guildId, characterId);
      toast({ title: "Personalización eliminada", description: "El objeto volvió al catálogo global.", tone: "success" });
      if (editingId === characterId) cancelEdit();
      setImageCacheToken((value) => value + 1);
      await onReload();
    } catch (err) {
      toast({ title: "No se pudo resetear", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSavingId(null);
    }
  }

  async function handleBanFromShop(characterId: string, itemName: string) {
    if (!window.confirm(
      `¿Quitar "${itemName}" de la tienda y borrar sus datos insertados (imagen, precio custom, etc.)?\n\nEl personaje global no se borra; solo deja de venderse en este servidor.`,
    )) return;
    setSavingId(characterId);
    try {
      await banGachaCatalogItem(guildId, characterId);
      toast({
        title: "Eliminado de la tienda",
        description: "Se borraron los datos de catálogo insertados y ya no aparece en EyedShop.",
        tone: "success",
      });
      if (editingId === characterId) cancelEdit();
      setImageCacheToken((value) => value + 1);
      await onReload();
    } catch (err) {
      toast({ title: "No se pudo eliminar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSavingId(null);
    }
  }

  async function handleUpload(characterId: string, file: File | null) {
    if (!file) return;
    setUploadingId(characterId);
    try {
      await uploadGachaCatalogImage(guildId, characterId, file);
      toast({ title: "Imagen actualizada", description: "La imagen anterior fue reemplazada.", tone: "success" });
      setImageCacheToken((value) => value + 1);
      await onReload();
      if (editingId === characterId) {
        setEditForm((current) => (current ? { ...current, imageUrl: "" } : current));
      }
    } catch (err) {
      toast({ title: "No se pudo subir imagen", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setUploadingId(null);
    }
  }

  async function handleClearImage(characterId: string) {
    setSavingId(characterId);
    try {
      await saveGachaCatalogItem(guildId, characterId, { clearCatalogImage: true, imageUrl: "" });
      toast({ title: "Imagen eliminada", description: "Se quitó la imagen personalizada del objeto.", tone: "success" });
      setImageCacheToken((value) => value + 1);
      await onReload();
    } catch (err) {
      toast({ title: "No se pudo eliminar imagen", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSavingId(null);
    }
  }

  if (!items.length) {
    return (
      <div className="space-y-5">
        <CommunityShopProductsPanel guildId={guildId} characters={[]} premiumLocked={premiumLocked} />
        <EmptyState
          icon={<ShoppingBag className="h-6 w-6" />}
          title="Catálogo gacha vacío"
          description="No hay personajes cargados en el catálogo clásico."
        />
      </div>
    );
  }

  const busy = Boolean(editingId && (savingId === editingId || uploadingId === editingId));
  const selectedCategory = editForm ? categorySelectValue(editForm.series) : "personajes";

  return (
    <div className="space-y-5">
      <CommunityShopProductsPanel guildId={guildId} characters={items} premiumLocked={premiumLocked} />

      <div className="border-t border-white/10 pt-5">
        <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Catálogo gacha clásico</p>
      </div>
      <Field label="Buscar en catálogo">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, serie o ID" />
      </Field>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((item, index) => {
          const id = toStringValue(item.id, `shop-${index}`);
          const imageSrc = resolveShopImage(item, guildId, imageCacheToken);
          const hasOverride =
            item.shopPriceOverride !== undefined ||
            toBooleanValue(item.shopHidden) ||
            toBooleanValue(item.catalogRemoved) ||
            toBooleanValue(item.catalogDbImage);
          const cardBusy = savingId === id || uploadingId === id;

          return (
            <div key={id} className="overflow-hidden rounded-3xl border border-white/10 bg-black/20">
              {imageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageSrc} alt="" className="h-40 w-full object-cover" />
              ) : (
                <div className="flex h-40 items-center justify-center bg-white/5 text-sm text-zinc-500">Sin imagen</div>
              )}
              <div className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-white">{toStringValue(item.name, "Item")}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-fuchsia-300">
                      {toStringValue(item.rarity, "N")} · {toStringValue(item.series, "sin serie")}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {toBooleanValue(item.shopHidden) ? <Badge variant="default">Oculto</Badge> : null}
                    {toBooleanValue(item.catalogRemoved) ? <Badge variant="danger">Fuera catálogo</Badge> : null}
                    {item.shopPriceOverride !== undefined ? <Badge variant="premium">Precio custom</Badge> : null}
                  </div>
                </div>

                <p className="line-clamp-3 text-sm text-zinc-400">{toStringValue(item.description, "Sin descripción")}</p>
                <p className="text-sm text-fuchsia-200">
                  {toStringValue(item.price, "0")} monedas
                  {item.shopPriceDefault !== undefined ? (
                    <span className="ml-2 text-xs text-zinc-500">(base {toNumberValue(item.shopPriceDefault)})</span>
                  ) : null}
                </p>
                <p className="truncate text-[11px] text-zinc-600">ID: {id}</p>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={premiumLocked || cardBusy} onClick={() => startEdit(item)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={premiumLocked || cardBusy}
                    onClick={() => void handleBanFromShop(id, toStringValue(item.name, "objeto"))}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    {toBooleanValue(item.catalogRemoved) ? "Purgar datos" : "Quitar de tienda"}
                  </Button>
                  {hasOverride && !toBooleanValue(item.catalogRemoved) ? (
                    <Button size="sm" variant="ghost" disabled={premiumLocked || cardBusy} onClick={() => void handleReset(id)}>
                      <RotateCcw className="mr-1 h-3.5 w-3.5" />
                      Resetear
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={Boolean(editingItem && editForm)}
        onClose={cancelEdit}
        wide
        title={editForm ? `Editar ${editForm.name || "objeto"}` : "Editar objeto"}
        description="La categoría se usa como filtro en EyedShop. La serie personalizada también cuenta como categoría."
        footer={(
          <>
            <Button variant="ghost" onClick={cancelEdit} disabled={busy}>
              <X className="mr-2 h-4 w-4" />Cancelar
            </Button>
            {editingId ? (
              <Button
                variant="danger"
                className="mr-auto"
                disabled={premiumLocked || busy}
                onClick={() => void handleBanFromShop(editingId, editForm?.name || "objeto")}
              >
                <Trash2 className="mr-2 h-4 w-4" />Quitar de tienda
              </Button>
            ) : null}
            {editingId ? (
              <Button variant="ghost" disabled={premiumLocked || busy} onClick={() => void handleClearImage(editingId)}>
                Quitar imagen
              </Button>
            ) : null}
            <Button disabled={premiumLocked || busy || !editingId} onClick={() => editingId && void handleSave(editingId)}>
              <Save className="mr-2 h-4 w-4" />
              {savingId === editingId ? "Guardando…" : "Guardar cambios"}
            </Button>
          </>
        )}
      >
        {editForm && editingItem && editingId ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nombre">
              <Input value={editForm.name} onChange={(event) => setEditForm((c) => (c ? { ...c, name: event.target.value } : c))} />
            </Field>
            <Field label="Rareza">
              <Select value={editForm.rarity} onChange={(event) => setEditForm((c) => (c ? { ...c, rarity: event.target.value } : c))}>
                <option value="SSR">SSR</option>
                <option value="SR">SR</option>
                <option value="R">R</option>
                <option value="N">N</option>
              </Select>
            </Field>
            <Field label="Categoría (EyedComun)">
              <Select
                value={selectedCategory}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "__custom__") {
                    setEditForm((c) => (c ? {
                      ...c,
                      series: CATEGORY_OPTIONS.some((o) => o.value === c.series.trim().toLowerCase()) ? "" : c.series,
                    } : c));
                    return;
                  }
                  setEditForm((c) => (c ? { ...c, series: value } : c));
                }}
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
                <option value="__custom__">Personalizada / serie…</option>
              </Select>
            </Field>
            <Field label="Precio en tienda" description="Vacío = precio automático del bot">
              <Input
                type="number"
                value={editForm.shopPrice}
                onChange={(event) => setEditForm((c) => (c ? { ...c, shopPrice: event.target.value } : c))}
                placeholder={String(toNumberValue(editingItem.shopPriceDefault, 0) || "")}
              />
            </Field>
            {selectedCategory === "__custom__" ? (
              <Field label="Serie / categoría personalizada" description="Aparece como filtro de categoría en EyedShop">
                <Input
                  value={editForm.series}
                  onChange={(event) => setEditForm((c) => (c ? { ...c, series: event.target.value } : c))}
                  placeholder="Ej. Corte de Cristal"
                />
              </Field>
            ) : null}
            <div className="md:col-span-2">
              <Field label="Descripción">
                <Textarea
                  value={editForm.description}
                  onChange={(event) => setEditForm((c) => (c ? { ...c, description: event.target.value } : c))}
                  rows={3}
                />
              </Field>
            </div>
            <div className="md:col-span-2">
              <EmbedImageField
                label="Imagen URL"
                description="URL externa o sube un archivo (reemplaza la imagen anterior)."
                value={editForm.imageUrl}
                onChange={(imageUrl) => setEditForm((c) => (c ? { ...c, imageUrl } : c))}
                uploading={uploadingId === editingId}
                onUpload={async (file) => handleUpload(editingId, file)}
                onDelete={() => void handleClearImage(editingId)}
                deleting={savingId === editingId}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-3 py-2 md:col-span-2">
              <div>
                <p className="text-sm text-white">Ocultar de la tienda</p>
                <p className="text-xs text-zinc-500">No aparece en la tienda del servidor ni en EyedShop.</p>
              </div>
              <Switch
                checked={editForm.shopHidden}
                onCheckedChange={(shopHidden) => setEditForm((c) => (c ? { ...c, shopHidden } : c))}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-3 py-2 md:col-span-2">
              <div>
                <p className="text-sm text-white">Quitar del catálogo / tienda</p>
                <p className="text-xs text-zinc-500">
                  Al guardar o usar «Quitar de tienda» se borran imagen y datos insertados; solo queda fuera de EyedShop.
                </p>
              </div>
              <Switch
                checked={editForm.catalogRemoved}
                onCheckedChange={(catalogRemoved) => setEditForm((c) => (c ? { ...c, catalogRemoved } : c))}
              />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
