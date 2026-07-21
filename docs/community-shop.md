# Tienda comunitaria

EyedBot es la fuente de verdad del catálogo, los EyedCoins, el stock, los límites,
las compras y las entregas. EyedComun solo muestra el catálogo y actúa como BFF.

## Activación

La tienda admite compras únicamente cuando se cumplen las tres condiciones:

- `features.shop` está activo en la configuración comunitaria.
- `economyEnabled` está activo en la configuración gacha de EyedBot.
- `shopEnabled` está activo en la configuración gacha de EyedBot.

Los productos del catálogo gacha visible (`getShopCatalog`) se publican
automáticamente en EyedComun. Además puedes crear en **Panel EyedBot >
Servidor > Gacha > Tienda** roles, objetos o packs especiales.

## API de servicio

Todas las rutas requieren `Authorization: Bearer COMMUNITY_API_KEY` y la firma
HMAC comunitaria.

### `GET /api/community/shop`

Devuelve `{ products, balance, requestId }`. Cada producto incluye precio,
stock restante, límite y cantidad comprada por el usuario.

### `POST /api/community/shop/purchases`

Entrada:

```json
{
  "productId": "uuid",
  "quantity": 1,
  "idempotencyKey": "uuid-generado-por-el-cliente"
}
```

Salida: `{ purchaseId, productId, quantity, spentCoins, balance, status,
idempotent, requestId }`.

La clave de idempotencia es única por servidor y usuario. Saldo, stock, compra e
inventario se escriben en una transacción con bloqueos. Los roles se entregan
después del commit; si Discord rechaza la entrega, EyedBot reembolsa las monedas
y restaura el stock.

Errores relevantes: `FEATURE_DISABLED`, `SHOP_DISABLED`, `OUT_OF_STOCK`,
`INSUFFICIENT_BALANCE`, `PURCHASE_LIMIT_REACHED`, `INVENTORY_FULL`,
`ROLE_ALREADY_OWNED`, `ROLE_DELIVERY_FAILED`, `PURCHASE_FINALIZATION_FAILED` y
`PRODUCT_UNAVAILABLE`.

## Categorías

Cada producto incluye `category` (`general`, `personajes`, `roles`, `objetos`,
`boosts`, `eventos`, `cosmeticos` u otra clave normalizada). El listado público
devuelve también `categories` y EyedComun filtra por ellas.

## Migración

Los despliegues existentes crean las tablas al iniciar EyedBot. Para una
migración manual se puede ejecutar:

`docker/mysql/community-shop-v1.sql`
