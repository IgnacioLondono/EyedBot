"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, PackagePlus, Pencil, Save, X } from "lucide-react";
import {
  archiveCommunityShopProduct,
  createCommunityShopProduct,
  getCommunityShopProducts,
  updateCommunityShopProduct,
} from "@/lib/api/endpoints";
import { useToast } from "@/components/providers/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
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

const CATEGORY_OPTIONS = [
  { value: "general", label: "General" },
  { value: "personajes", label: "Personajes" },
  { value: "roles", label: "Roles" },
  { value: "objetos", label: "Objetos" },
  { value: "boosts", label: "Boosts" },
  { value: "eventos", label: "Eventos" },
  { value: "cosmeticos", label: "Cosméticos" },
];

const emptyForm: FormState = {
  type: "item",
  name: "",
  description: "",
  imageUrl: "",
  category: "general",
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  function reset() {
    setEditingId(null);
    setForm(emptyForm);
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
      reset();
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
      if (editingId === id) reset();
      await load();
      toast({ title: "Producto desactivado", tone: "success" });
    } catch (error) {
      toast({ title: "No se pudo desactivar", description: getErrorMessage(error), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5 rounded-3xl border border-fuchsia-400/15 bg-fuchsia-400/[0.035] p-5">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-fuchsia-300">Tienda de EyedComun</p>
        <h3 className="mt-1 text-xl font-semibold text-white">Productos y entregas</h3>
        <p className="mt-1 text-sm text-zinc-400">Crea personajes, roles automáticos u objetos virtuales con stock opcional.</p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-white/8 bg-black/25 p-4 md:grid-cols-2">
        <Field label="Tipo">
          <Select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as ProductType }))}>
            <option value="item">Objeto virtual</option>
            <option value="character">Personaje gacha</option>
            <option value="role">Rol de Discord</option>
          </Select>
        </Field>
        <Field label="Nombre"><Input value={form.name} maxLength={120} onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))} /></Field>
        <Field label="Categoría">
          <Select value={form.category} onChange={(event) => setForm((c) => ({ ...c, category: event.target.value }))}>
            {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </Field>
        <Field label="Precio en EyedCoins"><Input type="number" min={1} value={form.priceCoins} onChange={(event) => setForm((c) => ({ ...c, priceCoins: event.target.value }))} /></Field>
        <Field label="Stock" description="Vacío = ilimitado"><Input type="number" min={0} value={form.stock} onChange={(event) => setForm((c) => ({ ...c, stock: event.target.value }))} /></Field>
        <Field label="Límite por usuario" description="Vacío = sin límite"><Input type="number" min={1} value={form.perUserLimit} disabled={form.type === "role"} onChange={(event) => setForm((c) => ({ ...c, perUserLimit: event.target.value }))} /></Field>
        <Field label="Orden"><Input type="number" min={0} value={form.sortOrder} onChange={(event) => setForm((c) => ({ ...c, sortOrder: event.target.value }))} /></Field>
        {form.type === "character" ? (
          <Field label="Personaje">
            <Select value={form.characterId} onChange={(event) => setForm((c) => ({ ...c, characterId: event.target.value }))}>
              <option value="">Seleccionar personaje…</option>
              {characterOptions.map((item) => <option key={toStringValue(item.id)} value={toStringValue(item.id)}>{toStringValue(item.name)} · {toStringValue(item.rarity)}</option>)}
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
          <Field label="Clave del objeto" description="Ejemplo: ticket_dorado"><Input value={form.itemKey} maxLength={64} onChange={(event) => setForm((c) => ({ ...c, itemKey: event.target.value }))} /></Field>
        ) : null}
        <Field label="URL de imagen"><Input type="url" value={form.imageUrl} onChange={(event) => setForm((c) => ({ ...c, imageUrl: event.target.value }))} /></Field>
        <div className="md:col-span-2"><Field label="Descripción"><Textarea value={form.description} maxLength={500} onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))} /></Field></div>
        <div className="flex items-center justify-between gap-3 md:col-span-2">
          <div><p className="text-sm text-white">Disponible</p><p className="text-xs text-zinc-500">Los inactivos no aparecen en EyedComun.</p></div>
          <Switch checked={form.active} onCheckedChange={(active) => setForm((c) => ({ ...c, active }))} />
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button disabled={premiumLocked || saving || !form.name.trim()} onClick={() => void save()}>
            {editingId ? <Save className="mr-2 h-4 w-4" /> : <PackagePlus className="mr-2 h-4 w-4" />}
            {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear producto"}
          </Button>
          {editingId ? <Button variant="ghost" onClick={reset}><X className="mr-2 h-4 w-4" />Cancelar</Button> : null}
        </div>
      </div>

      {loading ? <p className="text-sm text-zinc-500">Cargando productos…</p> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const id = toStringValue(product.id);
            const stock = product.stock === null ? "Ilimitado" : `${toNumberValue(product.remainingStock)} restantes`;
            return (
              <article key={id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><h4 className="font-medium text-white">{toStringValue(product.name)}</h4><p className="mt-1 text-xs uppercase tracking-wider text-fuchsia-300">{toStringValue(product.category, "general")} · {toStringValue(product.type)}</p></div>
                  {!toBooleanValue(product.active) ? <Badge variant="danger">Inactivo</Badge> : null}
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-zinc-400">{toStringValue(product.description, "Sin descripción")}</p>
                <p className="mt-3 text-sm text-fuchsia-100">{toNumberValue(product.priceCoins).toLocaleString("es")} EyedCoins · {stock}</p>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="secondary" disabled={saving} onClick={() => { setEditingId(id); setForm(productForm(product)); }}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />Editar
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
      )}
    </section>
  );
}
