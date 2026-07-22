"use client";

import { useMemo, useState } from "react";
import { CheckSquare, Pencil, RotateCcw, Save, ShoppingBag, Square, Trash2, X } from "lucide-react";
import {
  banGachaCatalogItem,
  banGachaCatalogItems,
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
import { asRecord, getErrorMessage, toBooleanValue, toNumberValue, toStringValue } from "@/lib/utils";

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

function seriesKey(item: ShopItem) {
  return toStringValue(item.series, "Sin categoría").trim() || "Sin categoría";
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
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  const editingId = editingItem ? toStringValue(editingItem.id) : null;

  const existingCategories = useMemo(() => {
    return [...new Set(items.map((item) => seriesKey(item)))].sort((a, b) => a.localeCompare(b, "es"));
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilter !== "all" && seriesKey(item) !== categoryFilter) return false;
      if (!q) return true;
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
  }, [items, query, categoryFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, ShopItem[]>();
    for (const item of filtered) {
      const key = seriesKey(item);
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [filtered]);

  const visibleIds = useMemo(
    () => filtered.map((item, index) => toStringValue(item.id, `shop-${index}`)),
    [filtered],
  );

  function startEdit(item: ShopItem) {
    setEditingItem(item);
    setEditForm(itemToEditState(item));
  }

  function cancelEdit() {
    setEditingItem(null);
    setEditForm(null);
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => (
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    ));
  }

  function toggleSelectVisible() {
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? selectedIds.filter((id) => !visibleIds.includes(id)) : [...new Set([...selectedIds, ...visibleIds])]);
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
      setSelectedIds((current) => current.filter((id) => id !== characterId));
      if (editingId === characterId) cancelEdit();
      setImageCacheToken((value) => value + 1);
      await onReload();
    } catch (err) {
      toast({ title: "No se pudo eliminar", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setSavingId(null);
    }
  }

  async function handleBulkBan() {
    if (!selectedIds.length) return;
    if (!window.confirm(`¿Quitar ${selectedIds.length} objetos de la tienda y purgar sus datos insertados?`)) return;
    setBulkBusy(true);
    try {
      const payload = asRecord(await banGachaCatalogItems(guildId, selectedIds));
      toast({
        title: "Eliminación masiva lista",
        description: `${toNumberValue(payload.banned)} fuera de tienda · ${toNumberValue(payload.failed)} fallaron.`,
        tone: "success",
      });
      setSelectedIds([]);
      setImageCacheToken((value) => value + 1);
      await onReload();
    } catch (err) {
      toast({ title: "No se pudo eliminar la selección", description: getErrorMessage(err), tone: "danger" });
    } finally {
      setBulkBusy(false);
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

  const busy = Boolean(editingId && (savingId === editingId || uploadingId === editingId)) || bulkBusy;
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  return (
    <div className="space-y-5">
      <CommunityShopProductsPanel guildId={guildId} characters={items} premiumLocked={premiumLocked} />

      <div className="border-t border-white/10 pt-5">
        <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Catálogo gacha clásico</p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_auto_auto]">
        <Field label="Buscar">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, serie o ID" />
        </Field>
        <Field label="Categoría existente">
          <Select
            value={existingCategories.includes(categoryFilter) || categoryFilter === "all" ? categoryFilter : "all"}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="all">Todas ({existingCategories.length})</option>
            {existingCategories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <Button variant="secondary" disabled={!visibleIds.length || bulkBusy} onClick={toggleSelectVisible}>
            {allVisibleSelected ? <CheckSquare className="mr-2 h-4 w-4" /> : <Square className="mr-2 h-4 w-4" />}
            {allVisibleSelected ? "Quitar selección" : "Seleccionar visibles"}
          </Button>
        </div>
        <div className="flex items-end">
          <Button variant="danger" disabled={premiumLocked || bulkBusy || selectedIds.length === 0} onClick={() => void handleBulkBan()}>
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar {selectedIds.length || ""}
          </Button>
        </div>
      </div>

      {grouped.map(([category, categoryItems]) => (
        <section key={category} className="space-y-3">
          <h4 className="text-sm font-medium uppercase tracking-[0.14em] text-fuchsia-300">
            {category} · {categoryItems.length}
          </h4>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {categoryItems.map((item, index) => {
              const id = toStringValue(item.id, `shop-${index}`);
              const imageSrc = resolveShopImage(item, guildId, imageCacheToken);
              const hasOverride =
                item.shopPriceOverride !== undefined ||
                toBooleanValue(item.shopHidden) ||
                toBooleanValue(item.catalogRemoved) ||
                toBooleanValue(item.catalogDbImage);
              const cardBusy = savingId === id || uploadingId === id || bulkBusy;
              const checked = selectedIds.includes(id);

              return (
                <div
                  key={id}
                  className={`overflow-hidden rounded-3xl border bg-black/20 ${
                    checked ? "border-fuchsia-400/45" : "border-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-white/8 px-4 py-2">
                    <label className="flex items-center gap-2 text-xs text-zinc-400">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={premiumLocked || cardBusy}
                        onChange={() => toggleSelected(id)}
                      />
                      Seleccionar
                    </label>
                    {toBooleanValue(item.catalogRemoved) ? <Badge variant="danger">Fuera catálogo</Badge> : null}
                  </div>
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
                          {toStringValue(item.rarity, "N")} · {seriesKey(item)}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1">
                        {toBooleanValue(item.shopHidden) ? <Badge variant="default">Oculto</Badge> : null}
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
                        {toBooleanValue(item.catalogRemoved) ? "Purgar" : "Quitar"}
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
        </section>
      ))}

      <Modal
        open={Boolean(editingItem && editForm)}
        onClose={cancelEdit}
        wide
        title={editForm ? `Editar ${editForm.name || "objeto"}` : "Editar objeto"}
        description="La categoría/serie es libre: escribe una nueva o elige una que ya exista en el catálogo."
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
            <Field label="Categoría / serie" description="Solo usa categorías reales; puedes crear una nueva escribiendo.">
              <Input
                list={`gacha-series-${guildId}`}
                value={editForm.series}
                onChange={(event) => setEditForm((c) => (c ? { ...c, series: event.target.value } : c))}
                placeholder="Ej. Corte de Cristal"
              />
              <datalist id={`gacha-series-${guildId}`}>
                {existingCategories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </Field>
            <Field label="Precio en tienda" description="Vacío = precio automático del bot">
              <Input
                type="number"
                value={editForm.shopPrice}
                onChange={(event) => setEditForm((c) => (c ? { ...c, shopPrice: event.target.value } : c))}
                placeholder={String(toNumberValue(editingItem.shopPriceDefault, 0) || "")}
              />
            </Field>
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
                  Al guardar se borran imagen y datos insertados; solo queda fuera de EyedShop.
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
