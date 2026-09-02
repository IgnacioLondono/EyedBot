"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, CheckSquare, PackagePlus, Pencil, Plus, Save, Square, Trash2, X } from "lucide-react";
import {
  archiveCommunityShopProduct,
  createCommunityShopProduct,
  deleteCommunityShopProduct,
  deleteCommunityShopProducts,
  getCommunityShopProducts,
  updateCommunityShopProduct,
  uploadCommunityShopImage,
} from "@/lib/api/endpoints";
import { useToast } from "@/components/providers/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { EmbedImageField } from "@/components/features/embed/EmbedImageField";
import { Field, Input, Select, Textarea } from "@/components/features/shared";
import { useGuildRoles } from "@/lib/hooks/useGuildRoles";
import { asArray, asRecord, getErrorMessage, toBooleanValue, toNumberValue, toStringValue } from "@/lib/utils";

type ProductType = "character" | "role" | "item";
type Product = Record<string, unknown>;
type FormState = {
  type: ProductType;
  name: string;
  description: string;
  imageUrl: string;
  category: string;
  priceCoins: string;
  stock: string;
  perUserLimit: string;
  characterId: string;
  roleId: string;
  itemKey: string;
  sortOrder: string;
  active: boolean;
};

const emptyForm: FormState = {
  type: "item",
  name: "",
  description: "",
  imageUrl: "",
  category: "",
  priceCoins: "100",
  stock: "",
  perUserLimit: "",
  characterId: "",
  roleId: "",
  itemKey: "",
  sortOrder: "0",
  active: true,
};

function productForm(product: Product): FormState {
  return {
    type: toStringValue(product.type, "item") as ProductType,
    name: toStringValue(product.name),
    description: toStringValue(product.description),
    imageUrl: toStringValue(product.imageUrl),
    category: toStringValue(product.category, "general"),
    priceCoins: String(toNumberValue(product.priceCoins, 100)),
    stock: product.stock === null || product.stock === undefined ? "" : String(toNumberValue(product.stock)),
    perUserLimit: product.perUserLimit === null || product.perUserLimit === undefined ? "" : String(toNumberValue(product.perUserLimit)),
    characterId: toStringValue(product.characterId),
    roleId: toStringValue(product.roleId),
    itemKey: toStringValue(product.itemKey),
    sortOrder: String(toNumberValue(product.sortOrder)),
    active: toBooleanValue(product.active, true),
  };
}

function requestBody(form: FormState) {
  return {
    type: form.type,
    name: form.name.trim(),
    description: form.description.trim(),
    imageUrl: form.imageUrl.trim() || null,
    category: form.category.trim() || "general",
    priceCoins: Number.parseInt(form.priceCoins, 10),
    stock: form.stock.trim() ? Number.parseInt(form.stock, 10) : null,
    perUserLimit: form.perUserLimit.trim() ? Number.parseInt(form.perUserLimit, 10) : null,
    characterId: form.type === "character" ? form.characterId : null,
    roleId: form.type === "role" ? form.roleId : null,
    itemKey: form.type === "item" ? form.itemKey.trim().toLowerCase() : null,
    sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
    active: form.active,
  };
}

function categoryLabel(value: string) {
  return String(value || "sin-categoria").replace(/-/g, " ");
}

export function CommunityShopProductsPanel({
  guildId,
  characters,
  premiumLocked,
}: {
  guildId: string;
  characters: Product[];
  premiumLocked: boolean;
}) {
  const { toast } = useToast();
  const { roles } = useGuildRoles(guildId);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("all");

  const load = useCallback(async () => {
    const payload = asRecord(await getCommunityShopProducts(guildId));
    setProducts(asArray(payload.products).map((entry) => asRecord(entry)));
  }, [guildId]);

  useEffect(() => {
    let active = true;
    void getCommunityShopProducts(guildId)
      .then((payload) => {
        if (active) setProducts(asArray(asRecord(payload).products).map((entry) => asRecord(entry)));
      })
      .catch((error) => {
        if (active) toast({ title: "No se cargaron los productos", description: getErrorMessage(error), tone: "danger" });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [guildId, toast]);

  const characterOptions = useMemo(
    () => characters.filter((item) => !toBooleanValue(item.catalogRemoved)),
    [characters],
  );

  const existingCategories = useMemo(() => {
    return [...new Set(products.map((item) => toStringValue(item.category, "general")).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "es"));
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (categoryFilter === "all") return products;
    return products.filter((item) => toStringValue(item.category, "general") === categoryFilter);
  }, [products, categoryFilter]);

  const groupedProducts = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const product of filteredProducts) {
      const key = toStringValue(product.category, "general");
      const list = map.get(key) || [];
      list.push(product);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [filteredProducts]);

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function openCreate() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      category: existingCategories[0] || "",
    });
    setModalOpen(true);
  }

  function openEdit(product: Product) {
    setEditingId(toStringValue(product.id));
    setForm(productForm(product));
    setModalOpen(true);
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => (
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    ));
  }

  function toggleSelectVisible() {
    const visibleIds = filteredProducts.map((item) => toStringValue(item.id));
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected
      ? selectedIds.filter((id) => !visibleIds.includes(id))
      : [...new Set([...selectedIds, ...visibleIds])]);
  }

  async function save() {
    setSaving(true);
    try {
      if (editingId) {
        const current = products.find((item) => toStringValue(item.id) === editingId);
        await updateCommunityShopProduct(guildId, editingId, {
          ...requestBody(form),
          expectedVersion: toNumberValue(current?.version, 1),
        });
        toast({ title: "Producto actualizado", description: "La tienda de EyedComun ya usa los nuevos datos.", tone: "success" });
      } else {
        await createCommunityShopProduct(guildId, requestBody(form));
        toast({ title: "Producto creado", description: "Ya puede mostrarse en EyedComun.", tone: "success" });
      }
      closeModal();
      await load();
    } catch (error) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(error), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function archive(product: Product) {
    const id = toStringValue(product.id);
    if (!window.confirm(`¿Desactivar "${toStringValue(product.name)}" de la tienda?`)) return;
    setSaving(true);
    try {
      await archiveCommunityShopProduct(guildId, id, toNumberValue(product.version, 1));
      if (editingId === id) closeModal();
      await load();
      toast({ title: "Producto desactivado", tone: "success" });
    } catch (error) {
      toast({ title: "No se pudo desactivar", description: getErrorMessage(error), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function removeProductById(product: Product) {
    const id = toStringValue(product.id);
    const name = toStringValue(product.name, "este producto");
    if (!window.confirm(`¿Eliminar definitivamente "${name}"? Se borrará de la base de datos (compras e inventario incluidos).`)) return;
    setSaving(true);
    try {
      await deleteCommunityShopProduct(guildId, id, toNumberValue(product.version, 1));
      toast({ title: "Producto eliminado", tone: "success" });
      setSelectedIds((current) => current.filter((entry) => entry !== id));
      if (editingId === id) closeModal();
      await load();
    } catch (error) {
      toast({ title: "No se pudo eliminar", description: getErrorMessage(error), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function removeProduct() {
    if (!editingId) return;
    const current = products.find((item) => toStringValue(item.id) === editingId);
    if (!current) return;
    await removeProductById(current);
  }

  async function removeSelected() {
    if (!selectedIds.length) return;
    if (!window.confirm(`¿Eliminar ${selectedIds.length} productos de la base de datos?`)) return;
    setSaving(true);
    try {
      const payload = selectedIds.map((id) => {
        const product = products.find((item) => toStringValue(item.id) === id);
        return { id, expectedVersion: toNumberValue(product?.version, 1) };
      });
      const result = asRecord(await deleteCommunityShopProducts(guildId, payload));
      toast({
        title: "Eliminación masiva lista",
        description: `${toNumberValue(result.deleted)} eliminados · ${toNumberValue(result.failed)} fallaron.`,
        tone: "success",
      });
      setSelectedIds([]);
      closeModal();
      await load();
    } catch (error) {
      toast({ title: "No se pudo eliminar la selección", description: getErrorMessage(error), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const payload = asRecord(await uploadCommunityShopImage(guildId, file, form.imageUrl || undefined));
      const imageUrl = toStringValue(payload.imageUrl);
      if (!imageUrl) throw new Error("La subida no devolvió una URL");
      setForm((current) => ({ ...current, imageUrl }));
      toast({ title: "Imagen subida", description: "Quedará guardada al crear o actualizar el producto.", tone: "success" });
    } catch (error) {
      toast({ title: "No se pudo subir la imagen", description: getErrorMessage(error), tone: "danger" });
    } finally {
      setUploading(false);
    }
  }

  const visibleIds = filteredProducts.map((item) => toStringValue(item.id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  return (
    <section className="space-y-5 rounded-3xl border border-fuchsia-400/15 bg-fuchsia-400/[0.035] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-fuchsia-300">Tienda de EyedComun</p>
          <h3 className="mt-1 text-xl font-semibold text-white">Extras y entregas especiales</h3>
          <p className="mt-1 text-sm text-zinc-400">
            El catálogo gacha clásico (abajo) ya se publica solo en EyedShop. Usa esta sección para roles, objetos o packs extra.
          </p>
        </div>
        <Button disabled={premiumLocked} onClick={openCreate} size="icon" aria-label="Añadir producto">
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      {!loading && products.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[180px] flex-1">
            <Field label="Categoría existente">
              <Select
                value={existingCategories.includes(categoryFilter) || categoryFilter === "all" ? categoryFilter : "all"}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="all">Todas ({existingCategories.length})</option>
                {existingCategories.map((category) => (
                  <option key={category} value={category}>{categoryLabel(category)}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Button variant="secondary" disabled={!visibleIds.length || saving} onClick={toggleSelectVisible}>
            {allVisibleSelected ? <CheckSquare className="mr-2 h-4 w-4" /> : <Square className="mr-2 h-4 w-4" />}
            {allVisibleSelected ? "Quitar selección" : "Seleccionar visibles"}
          </Button>
          <Button variant="danger" disabled={premiumLocked || saving || selectedIds.length === 0} onClick={() => void removeSelected()}>
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar {selectedIds.length || ""}
          </Button>
        </div>
      ) : null}

      {loading ? <p className="text-sm text-zinc-500">Cargando productos…</p> : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center">
          <p className="text-sm text-zinc-400">Todavía no hay extras. Pulsa + para crear el primero.</p>
          <Button className="mt-4" disabled={premiumLocked} onClick={openCreate}>
            <PackagePlus className="mr-2 h-4 w-4" />
            Nuevo producto
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {groupedProducts.map(([category, categoryItems]) => (
            <div key={category} className="space-y-3">
              <h4 className="text-xs font-medium uppercase tracking-[0.16em] text-fuchsia-300">
                {categoryLabel(category)} · {categoryItems.length}
              </h4>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {categoryItems.map((product) => {
                  const id = toStringValue(product.id);
                  const stock = product.stock === null ? "Ilimitado" : `${toNumberValue(product.remainingStock)} restantes`;
                  const checked = selectedIds.includes(id);
                  return (
                    <article key={id} className={`rounded-2xl border bg-black/20 p-4 ${checked ? "border-fuchsia-400/45" : "border-white/8"}`}>
                      <label className="mb-3 flex items-center gap-2 text-xs text-zinc-400">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={saving}
                          onChange={() => toggleSelected(id)}
                        />
                        Seleccionar
                      </label>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-medium text-white">{toStringValue(product.name)}</h4>
                          <p className="mt-1 text-xs uppercase tracking-wider text-fuchsia-300">
                            {categoryLabel(toStringValue(product.category, "general"))} · {toStringValue(product.type)}
                          </p>
                        </div>
                        {!toBooleanValue(product.active) ? <Badge variant="danger">Inactivo</Badge> : null}
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm text-zinc-400">{toStringValue(product.description, "Sin descripción")}</p>
                      <p className="mt-3 text-sm text-fuchsia-100">{toNumberValue(product.priceCoins).toLocaleString("es")} EyedCoins · {stock}</p>
                      <div className="mt-4 flex gap-2">
                        <Button size="sm" variant="secondary" disabled={saving} onClick={() => openEdit(product)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" />Editar
                        </Button>
                        <Button size="sm" variant="danger" disabled={saving} onClick={() => void removeProductById(product)}>
                          <Trash2 className="mr-1 h-3.5 w-3.5" />Eliminar
                        </Button>
                        {toBooleanValue(product.active) ? (
                          <Button size="sm" variant="ghost" disabled={saving} onClick={() => void archive(product)}>
                            <Archive className="mr-1 h-3.5 w-3.5" />Desactivar
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        wide
        title={editingId ? "Editar producto" : "Nuevo producto"}
        description="La categoría es libre: escribe una nueva o elige una que ya exista."
        footer={(
          <>
            {editingId ? (
              <Button variant="danger" className="mr-auto" disabled={premiumLocked || saving || uploading} onClick={() => void removeProduct()}>
                <Trash2 className="mr-2 h-4 w-4" />Eliminar
              </Button>
            ) : null}
            <Button variant="ghost" onClick={closeModal} disabled={saving || uploading}>
              <X className="mr-2 h-4 w-4" />Cancelar
            </Button>
            <Button disabled={premiumLocked || saving || uploading || !form.name.trim()} onClick={() => void save()}>
              {editingId ? <Save className="mr-2 h-4 w-4" /> : <PackagePlus className="mr-2 h-4 w-4" />}
              {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear producto"}
            </Button>
          </>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Tipo">
            <Select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as ProductType }))}>
              <option value="item">Objeto virtual</option>
              <option value="character">Personaje gacha</option>
              <option value="role">Rol de Discord</option>
            </Select>
          </Field>
          <Field label="Nombre">
            <Input value={form.name} maxLength={120} onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))} />
          </Field>
          <Field label="Categoría" description="Escribe una categoría nueva o elige una existente">
            <Input
              list={`community-shop-categories-${guildId}`}
              value={form.category}
              maxLength={64}
              placeholder="mi-categoria"
              onChange={(event) => setForm((c) => ({ ...c, category: event.target.value }))}
            />
            <datalist id={`community-shop-categories-${guildId}`}>
              {existingCategories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </Field>
          <Field label="Precio en EyedCoins">
            <Input type="number" min={1} value={form.priceCoins} onChange={(event) => setForm((c) => ({ ...c, priceCoins: event.target.value }))} />
          </Field>
          <Field label="Stock" description="Vacío = ilimitado">
            <Input type="number" min={0} value={form.stock} onChange={(event) => setForm((c) => ({ ...c, stock: event.target.value }))} />
          </Field>
          <Field label="Límite por usuario" description="Vacío = sin límite">
            <Input type="number" min={1} value={form.perUserLimit} disabled={form.type === "role"} onChange={(event) => setForm((c) => ({ ...c, perUserLimit: event.target.value }))} />
          </Field>
          <Field label="Orden">
            <Input type="number" min={0} value={form.sortOrder} onChange={(event) => setForm((c) => ({ ...c, sortOrder: event.target.value }))} />
          </Field>
          {form.type === "character" ? (
            <Field label="Personaje">
              <Select value={form.characterId} onChange={(event) => setForm((c) => ({ ...c, characterId: event.target.value }))}>
                <option value="">Seleccionar personaje…</option>
                {characterOptions.map((item) => (
                  <option key={toStringValue(item.id)} value={toStringValue(item.id)}>
                    {toStringValue(item.name)} · {toStringValue(item.rarity)}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {form.type === "role" ? (
            <Field label="Rol que entrega EyedBot">
              <Select value={form.roleId} onChange={(event) => setForm((c) => ({ ...c, roleId: event.target.value }))}>
                <option value="">Seleccionar rol…</option>
                {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </Select>
            </Field>
          ) : null}
          {form.type === "item" ? (
            <Field label="Clave del objeto" description="Ejemplo: ticket_dorado">
              <Input value={form.itemKey} maxLength={64} onChange={(event) => setForm((c) => ({ ...c, itemKey: event.target.value }))} />
            </Field>
          ) : null}
          <div className="md:col-span-2">
            <EmbedImageField
              label="Imagen del producto"
              description="Sube un archivo o pega una URL pública. La imagen se muestra en EyedShop."
              value={form.imageUrl}
              onChange={(imageUrl) => setForm((c) => ({ ...c, imageUrl }))}
              uploading={uploading}
              onUpload={handleUpload}
              onDelete={() => setForm((c) => ({ ...c, imageUrl: "" }))}
            />
          </div>
          <div className="md:col-span-2">
            <Field label="Descripción">
              <Textarea value={form.description} maxLength={500} onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))} />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-3 md:col-span-2">
            <div>
              <p className="text-sm text-white">Disponible</p>
              <p className="text-xs text-zinc-500">Los inactivos no aparecen en EyedComun.</p>
            </div>
            <Switch checked={form.active} onCheckedChange={(active) => setForm((c) => ({ ...c, active }))} />
          </div>
        </div>
      </Modal>
    </section>
  );
}
