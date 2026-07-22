const crypto = require('crypto');
const defaultDb = require('./database');
const gachaStore = require('./gacha-store');

const PRODUCT_TYPES = new Set(['character', 'role', 'item']);
const PURCHASE_STATUSES = new Set(['pending', 'completed', 'refunded', 'failed']);
const CATEGORY_PRESETS = Object.freeze([
    'general',
    'personajes',
    'roles',
    'objetos',
    'boosts',
    'eventos',
    'cosmeticos'
]);

function normalizeCategory(value) {
    const text = String(value || 'general').trim().toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
    return text || 'general';
}

class CommunityShopError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

function intInRange(value, min, max, fallback = null) {
    if (value === null || value === '') return null;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
    return parsed;
}

function optionalUrl(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    if (text.length > 500 || !/^https?:\/\//i.test(text)) {
        throw new CommunityShopError('INVALID_IMAGE_URL', 'La imagen debe usar HTTP o HTTPS');
    }
    return text;
}

function validateProduct(raw = {}, { partial = false } = {}) {
    const value = {};
    const has = (key) => Object.prototype.hasOwnProperty.call(raw, key);
    if (!partial || has('type')) {
        const type = String(raw.type || '').trim().toLowerCase();
        if (!PRODUCT_TYPES.has(type)) throw new CommunityShopError('INVALID_PRODUCT_TYPE', 'Tipo de producto inválido');
        value.type = type;
    }
    if (!partial || has('name')) {
        const name = String(raw.name || '').trim();
        if (name.length < 2 || name.length > 120) throw new CommunityShopError('INVALID_PRODUCT_NAME', 'Nombre inválido');
        value.name = name;
    }
    if (!partial || has('description')) {
        const description = String(raw.description || '').trim();
        if (description.length > 500) throw new CommunityShopError('INVALID_PRODUCT_DESCRIPTION', 'Descripción demasiado larga');
        value.description = description;
    }
    if (!partial || has('priceCoins')) {
        const priceCoins = intInRange(raw.priceCoins, 1, 1_000_000_000);
        if (!priceCoins) throw new CommunityShopError('INVALID_PRODUCT_PRICE', 'Precio inválido');
        value.priceCoins = priceCoins;
    }
    if (has('imageUrl') || !partial) value.imageUrl = optionalUrl(raw.imageUrl);
    if (has('category') || !partial) value.category = normalizeCategory(raw.category);
    if (has('stock') || !partial) {
        const stock = raw.stock === null || raw.stock === '' || raw.stock === undefined
            ? null
            : intInRange(raw.stock, 0, 1_000_000);
        if (raw.stock !== null && raw.stock !== '' && raw.stock !== undefined && stock === null) {
            throw new CommunityShopError('INVALID_PRODUCT_STOCK', 'Stock inválido');
        }
        value.stock = stock;
    }
    if (has('perUserLimit') || !partial) {
        const limit = raw.perUserLimit === null || raw.perUserLimit === '' || raw.perUserLimit === undefined
            ? null
            : intInRange(raw.perUserLimit, 1, 100_000);
        if (raw.perUserLimit !== null && raw.perUserLimit !== '' && raw.perUserLimit !== undefined && limit === null) {
            throw new CommunityShopError('INVALID_USER_LIMIT', 'Límite por usuario inválido');
        }
        value.perUserLimit = limit;
    }
    if (has('active') || !partial) value.active = raw.active !== false;
    if (has('sortOrder') || !partial) value.sortOrder = intInRange(raw.sortOrder, 0, 65_535, 0) || 0;
    if (has('characterId') || !partial) value.characterId = String(raw.characterId || '').trim() || null;
    if (has('roleId') || !partial) value.roleId = String(raw.roleId || '').trim() || null;
    if (has('itemKey') || !partial) {
        const itemKey = String(raw.itemKey || '').trim().toLowerCase();
        if (itemKey && !/^[a-z0-9_-]{1,64}$/.test(itemKey)) {
            throw new CommunityShopError('INVALID_ITEM_KEY', 'Clave de objeto inválida');
        }
        value.itemKey = itemKey || null;
    }
    return value;
}

function parseJson(value, fallback = null) {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(String(value || '')); } catch { return fallback; }
}

function mapProduct(row) {
    const stock = row.stock_total === null || row.stock_total === undefined ? null : Number(row.stock_total);
    const sold = Number(row.sold_count) || 0;
    return {
        id: String(row.product_id),
        type: String(row.product_type),
        name: String(row.name),
        description: String(row.description || ''),
        imageUrl: row.image_url ? String(row.image_url) : null,
        category: normalizeCategory(row.category),
        priceCoins: Number(row.price_coins) || 0,
        stock,
        remainingStock: stock === null ? null : Math.max(0, stock - sold),
        soldCount: sold,
        perUserLimit: row.per_user_limit === null || row.per_user_limit === undefined
            ? null
            : Number(row.per_user_limit),
        purchasedQuantity: Number(row.purchased_quantity) || 0,
        ownedQuantity: Number(row.owned_quantity) || 0,
        characterId: row.character_id ? String(row.character_id) : null,
        roleId: row.role_id ? String(row.role_id) : null,
        itemKey: row.item_key ? String(row.item_key) : null,
        active: Boolean(row.active),
        sortOrder: Number(row.sort_order) || 0,
        rarity: null,
        version: Number(row.version) || 1,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString()
    };
}

function publicProduct(row) {
    const {
        characterId: _characterId,
        roleId: _roleId,
        itemKey: _itemKey,
        version: _version,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...product
    } = mapProduct(row);
    return { ...product, source: 'community', sourceId: null, hasCatalogImage: false };
}

const GACHA_PRODUCT_NS = 'eyedcomun-gacha-v1';

function gachaProductId(characterId) {
    const hash = crypto.createHash('sha1')
        .update(`${GACHA_PRODUCT_NS}:${String(characterId || '')}`)
        .digest();
    hash[6] = (hash[6] & 0x0f) | 0x50;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    const hex = hash.subarray(0, 16).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function mapGachaCatalogProduct(character, { ownedQuantity = 0, hasCatalogImage = false } = {}) {
    const series = String(character.series || '').trim();
    const rarity = String(character.rarity || '').trim().toUpperCase();
    const description = String(character.description || '').trim()
        || [rarity, series].filter(Boolean).join(' · ');
    const remote = String(character?.imageUrl || '').trim();
    const imageUrl = /^https?:\/\//i.test(remote) ? remote.slice(0, 500) : null;
    return {
        id: gachaProductId(character.id),
        type: 'character',
        name: String(character.name || character.id),
        description: description.slice(0, 500),
        imageUrl,
        category: normalizeCategory(series || 'personajes'),
        priceCoins: Math.max(1, Number(character.price) || 1),
        stock: null,
        remainingStock: null,
        soldCount: 0,
        perUserLimit: null,
        purchasedQuantity: 0,
        ownedQuantity: Math.max(0, Number(ownedQuantity) || 0),
        active: true,
        sortOrder: 0,
        rarity: rarity || null,
        source: 'gacha',
        sourceId: String(character.id),
        hasCatalogImage: Boolean(hasCatalogImage)
    };
}

function validateReferences(product) {
    if (product.type === 'character') {
        if (!product.characterId || !gachaStore.getCharacterPool().some((item) => item.id === product.characterId)) {
            throw new CommunityShopError('CHARACTER_NOT_FOUND', 'Personaje no encontrado');
        }
        product.roleId = null;
        product.itemKey = null;
    } else if (product.type === 'role') {
        if (!/^\d{10,25}$/.test(String(product.roleId || ''))) {
            throw new CommunityShopError('INVALID_ROLE', 'Rol de Discord inválido');
        }
        product.characterId = null;
        product.itemKey = null;
        product.perUserLimit = 1;
    } else {
        if (!product.itemKey) throw new CommunityShopError('INVALID_ITEM_KEY', 'El objeto necesita una clave');
        product.characterId = null;
        product.roleId = null;
    }
    return product;
}

function createCommunityShopService({ db = defaultDb } = {}) {
    async function list(guildId, userId) {
        const [rows, profile, config, imageIds] = await Promise.all([
            db.query(
                `SELECT p.*,
                        COALESCE((
                            SELECT SUM(b.quantity) FROM community_shop_purchases b
                            WHERE b.product_id = p.product_id AND b.guild_id = p.guild_id
                              AND b.user_id = ? AND b.status IN ('pending','completed')
                        ), 0) AS purchased_quantity,
                        COALESCE(i.quantity, 0) AS owned_quantity
                 FROM community_shop_products p
                 LEFT JOIN community_shop_inventory i
                   ON i.product_id = p.product_id AND i.guild_id = p.guild_id AND i.user_id = ?
                 WHERE p.guild_id = ? AND p.active = TRUE
                 ORDER BY p.category ASC, p.sort_order ASC, p.created_at DESC`,
                [String(userId), String(userId), String(guildId)]
            ),
            gachaStore.getProfile(guildId, userId),
            gachaStore.getConfig(guildId),
            gachaStore.listGuildCatalogShopImageIds(guildId)
        ]);
        const ownedByCharacter = new Map();
        for (const entry of profile.inventory || []) {
            const characterId = String(entry?.characterId || '');
            if (!characterId) continue;
            ownedByCharacter.set(characterId, (ownedByCharacter.get(characterId) || 0) + 1);
        }
        const gachaCatalog = await gachaStore.getShopCatalog(guildId, config);
        const gachaCharacterIds = new Set(gachaCatalog.map((item) => String(item.id)));
        const gachaProducts = gachaCatalog.map((character) => mapGachaCatalogProduct(character, {
            ownedQuantity: ownedByCharacter.get(String(character.id)) || 0,
            hasCatalogImage: imageIds.has(String(character.id))
        }));
        const customProducts = rows
            .filter((row) => !(
                String(row.product_type) === 'character'
                && gachaCharacterIds.has(String(row.character_id || ''))
            ))
            .map(publicProduct);
        const products = [...gachaProducts, ...customProducts];
        const categories = [...new Set(products.map((item) => item.category))];
        const rarities = [...new Set(
            products.map((item) => String(item.rarity || '').trim().toUpperCase()).filter(Boolean)
        )].sort((left, right) => {
            const rank = { SSR: 4, SR: 3, R: 2, N: 1 };
            return (rank[right] || 0) - (rank[left] || 0) || left.localeCompare(right);
        });
        return { products, categories, rarities, balance: Number(profile.coins) || 0 };
    }

    async function purchaseGachaCharacter(guildId, userId, characterId, quantity, idempotencyKey) {
        const idemKey = `community_shop_gacha_idem_${guildId}_${userId}_${idempotencyKey}`;
        const existing = await db.query('SELECT `value` FROM key_value_store WHERE `key` = ?', [idemKey]);
        if (existing[0]?.value) {
            const cached = parseJson(existing[0].value, null);
            if (cached?.purchaseId) {
                const balance = Number((await gachaStore.getProfile(guildId, userId)).coins) || 0;
                return {
                    purchaseId: String(cached.purchaseId),
                    productId: String(cached.productId),
                    quantity: Number(cached.quantity) || quantity,
                    spentCoins: Number(cached.spentCoins) || 0,
                    balance,
                    status: 'completed',
                    idempotent: true
                };
            }
        }

        const config = await gachaStore.getConfig(guildId);
        if (!config.economyEnabled || config.shopEnabled === false) {
            throw new CommunityShopError('SHOP_DISABLED', 'La tienda gacha está desactivada', 403);
        }
        const catalog = await gachaStore.getShopCatalog(guildId, config);
        const character = catalog.find((item) => String(item.id) === String(characterId));
        if (!character) throw new CommunityShopError('PRODUCT_UNAVAILABLE', 'Producto no disponible', 410);
        const unitPrice = Math.max(1, Number(character.price) || 1);
        const totalPrice = unitPrice * quantity;
        if (!Number.isSafeInteger(totalPrice) || totalPrice < 1) {
            throw new CommunityShopError('INVALID_PRODUCT_PRICE', 'Precio inválido', 500);
        }

        const outcome = await db.transaction(async (tx) => {
            const profileKey = `gacha_profile_${guildId}_${userId}`;
            const seed = gachaStore.normalizeProfile(gachaStore.defaultProfile(userId), userId);
            await tx.query(
                'INSERT IGNORE INTO key_value_store (`key`, `value`) VALUES (?, ?)',
                [profileKey, JSON.stringify(seed)]
            );
            const profileRows = await tx.query(
                'SELECT `value` FROM key_value_store WHERE `key` = ? FOR UPDATE',
                [profileKey]
            );
            const idemRows = await tx.query(
                'SELECT `value` FROM key_value_store WHERE `key` = ? FOR UPDATE',
                [idemKey]
            );
            if (idemRows[0]?.value) {
                const cached = parseJson(idemRows[0].value, null);
                if (cached?.purchaseId) {
                    const profile = gachaStore.normalizeProfile(parseJson(profileRows[0]?.value, seed), userId);
                    return { cached, balance: profile.coins, idempotent: true };
                }
            }
            const profile = gachaStore.normalizeProfile(parseJson(profileRows[0]?.value, seed), userId);
            if (profile.coins < totalPrice) {
                throw new CommunityShopError('INSUFFICIENT_BALANCE', 'No tienes suficientes EyedCoins', 409);
            }
            if ((profile.inventory?.length || 0) + quantity > 2000) {
                throw new CommunityShopError('INVENTORY_FULL', 'Tu inventario está lleno', 409);
            }
            const entries = Array.from({ length: quantity }, () => gachaStore.buildInventoryEntry(character));
            profile.inventory.unshift(...entries);
            profile.collectionCount = profile.inventory.length;
            const rarityRank = (value) => {
                const order = { N: 1, R: 2, SR: 3, SSR: 4 };
                return order[String(value || '').toUpperCase()] || 0;
            };
            for (const entry of entries) {
                const rarity = String(entry.rarity || '').toUpperCase();
                if (!profile.bestRarity || rarityRank(rarity) > rarityRank(profile.bestRarity)) {
                    profile.bestRarity = rarity;
                }
            }
            profile.coins -= totalPrice;
            profile.updatedAt = new Date().toISOString();
            await tx.query(
                'UPDATE key_value_store SET `value` = ? WHERE `key` = ?',
                [JSON.stringify(profile), profileKey]
            );
            const purchaseId = crypto.randomUUID();
            const productId = gachaProductId(character.id);
            const payload = {
                purchaseId,
                productId,
                quantity,
                spentCoins: totalPrice,
                characterId: String(character.id),
                status: 'completed'
            };
            await tx.query(
                'INSERT INTO key_value_store (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
                [idemKey, JSON.stringify(payload)]
            );
            return { cached: payload, balance: profile.coins, idempotent: false };
        });

        gachaStore.invalidateProfileCache(guildId, userId);
        gachaStore.scheduleCommunityEvaluation(guildId, userId);
        return {
            purchaseId: String(outcome.cached.purchaseId),
            productId: String(outcome.cached.productId),
            quantity: Number(outcome.cached.quantity),
            spentCoins: Number(outcome.cached.spentCoins),
            balance: outcome.balance,
            status: 'completed',
            idempotent: outcome.idempotent
        };
    }

    async function listAdmin(guildId) {
        const rows = await db.query(
            `SELECT p.*, 0 AS purchased_quantity, 0 AS owned_quantity
             FROM community_shop_products p
             WHERE p.guild_id = ?
             ORDER BY p.category ASC, p.sort_order ASC, p.created_at DESC`,
            [String(guildId)]
        );
        return rows.map(mapProduct);
    }

    async function create(guildId, raw, actorId) {
        const value = validateReferences(validateProduct(raw));
        const id = crypto.randomUUID();
        const now = new Date();
        await db.query(
            `INSERT INTO community_shop_products
                (product_id, guild_id, product_type, name, description, image_url, category, price_coins,
                 stock_total, sold_count, per_user_limit, character_id, role_id, item_key,
                 active, sort_order, version, created_by, updated_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
            [
                id, String(guildId), value.type, value.name, value.description, value.imageUrl,
                value.category, value.priceCoins, value.stock, value.perUserLimit, value.characterId, value.roleId,
                value.itemKey, value.active, value.sortOrder, String(actorId), String(actorId), now, now
            ]
        );
        return (await listAdmin(guildId)).find((item) => item.id === id);
    }

    async function update(guildId, productId, raw, actorId) {
        const expectedVersion = intInRange(raw.expectedVersion, 1, 2_147_483_647);
        if (!expectedVersion) throw new CommunityShopError('INVALID_VERSION', 'Versión inválida');
        return db.transaction(async (tx) => {
            const rows = await tx.query(
                'SELECT * FROM community_shop_products WHERE guild_id = ? AND product_id = ? FOR UPDATE',
                [String(guildId), String(productId)]
            );
            if (!rows[0]) throw new CommunityShopError('PRODUCT_NOT_FOUND', 'Producto no encontrado', 404);
            const current = mapProduct({ ...rows[0], purchased_quantity: 0, owned_quantity: 0 });
            if (current.version !== expectedVersion) {
                throw new CommunityShopError('VERSION_CONFLICT', 'El producto cambió; recarga el catálogo', 409);
            }
            const patch = validateProduct(raw, { partial: true });
            const next = validateReferences({
                type: patch.type ?? current.type,
                name: patch.name ?? current.name,
                description: patch.description ?? current.description,
                imageUrl: Object.hasOwn(patch, 'imageUrl') ? patch.imageUrl : current.imageUrl,
                category: patch.category ?? current.category,
                priceCoins: patch.priceCoins ?? current.priceCoins,
                stock: Object.hasOwn(patch, 'stock') ? patch.stock : current.stock,
                perUserLimit: Object.hasOwn(patch, 'perUserLimit') ? patch.perUserLimit : current.perUserLimit,
                characterId: Object.hasOwn(patch, 'characterId') ? patch.characterId : current.characterId,
                roleId: Object.hasOwn(patch, 'roleId') ? patch.roleId : current.roleId,
                itemKey: Object.hasOwn(patch, 'itemKey') ? patch.itemKey : current.itemKey,
                active: patch.active ?? current.active,
                sortOrder: patch.sortOrder ?? current.sortOrder
            });
            if (next.stock !== null && next.stock < current.soldCount) {
                throw new CommunityShopError('STOCK_BELOW_SOLD', 'El stock no puede ser menor a las ventas');
            }
            const now = new Date();
            await tx.query(
                `UPDATE community_shop_products SET product_type = ?, name = ?, description = ?,
                    image_url = ?, category = ?, price_coins = ?, stock_total = ?, per_user_limit = ?,
                    character_id = ?, role_id = ?, item_key = ?, active = ?, sort_order = ?,
                    version = version + 1, updated_by = ?, updated_at = ?
                 WHERE guild_id = ? AND product_id = ? AND version = ?`,
                [
                    next.type, next.name, next.description, next.imageUrl, next.category, next.priceCoins, next.stock,
                    next.perUserLimit, next.characterId, next.roleId, next.itemKey, next.active,
                    next.sortOrder, String(actorId), now, String(guildId), String(productId), expectedVersion
                ]
            );
            return { ...current, ...next, version: expectedVersion + 1, updatedAt: now.toISOString() };
        });
    }

    async function archive(guildId, productId, expectedVersion, actorId) {
        const version = intInRange(expectedVersion, 1, 2_147_483_647);
        if (!version) throw new CommunityShopError('INVALID_VERSION', 'Versión inválida');
        const result = await db.query(
            `UPDATE community_shop_products SET active = FALSE, version = version + 1,
                updated_by = ?, updated_at = NOW(3)
             WHERE guild_id = ? AND product_id = ? AND version = ?`,
            [String(actorId), String(guildId), String(productId), version]
        );
        if (!result.affectedRows) throw new CommunityShopError('VERSION_CONFLICT', 'Producto no encontrado o modificado', 409);
        return { archived: true };
    }

    async function remove(guildId, productId, expectedVersion) {
        const version = expectedVersion === undefined || expectedVersion === null || expectedVersion === ''
            ? null
            : intInRange(expectedVersion, 1, 2_147_483_647);
        if (expectedVersion !== undefined && expectedVersion !== null && expectedVersion !== '' && !version) {
            throw new CommunityShopError('INVALID_VERSION', 'Versión inválida');
        }
        const deleted = await db.transaction(async (tx) => {
            const rows = version
                ? await tx.query(
                    `SELECT product_id, image_url, version FROM community_shop_products
                     WHERE guild_id = ? AND product_id = ? AND version = ?
                     FOR UPDATE`,
                    [String(guildId), String(productId), version]
                )
                : await tx.query(
                    `SELECT product_id, image_url, version FROM community_shop_products
                     WHERE guild_id = ? AND product_id = ?
                     FOR UPDATE`,
                    [String(guildId), String(productId)]
                );
            const row = rows[0];
            if (!row) throw new CommunityShopError('VERSION_CONFLICT', 'Producto no encontrado o modificado', 409);
            await tx.query('DELETE FROM community_shop_inventory WHERE product_id = ?', [String(productId)]);
            await tx.query('DELETE FROM community_shop_purchases WHERE product_id = ?', [String(productId)]);
            const result = await tx.query(
                'DELETE FROM community_shop_products WHERE guild_id = ? AND product_id = ?',
                [String(guildId), String(productId)]
            );
            if (!result.affectedRows) {
                throw new CommunityShopError('VERSION_CONFLICT', 'Producto no encontrado o modificado', 409);
            }
            return { deleted: true, imageUrl: row.image_url ? String(row.image_url) : null };
        });
        return deleted;
    }

    async function refundRolePurchase(guildId, userId, purchaseId, reason) {
        await db.transaction(async (tx) => {
            const key = `gacha_profile_${guildId}_${userId}`;
            const profiles = await tx.query('SELECT `value` FROM key_value_store WHERE `key` = ? FOR UPDATE', [key]);
            const rows = await tx.query(
                'SELECT * FROM community_shop_purchases WHERE purchase_id = ? AND guild_id = ? AND user_id = ? FOR UPDATE',
                [purchaseId, String(guildId), String(userId)]
            );
            const purchase = rows[0];
            if (!purchase || purchase.status !== 'pending') return;
            const profile = gachaStore.normalizeProfile(parseJson(profiles[0]?.value, {}), userId);
            profile.coins += Number(purchase.total_price) || 0;
            profile.updatedAt = new Date().toISOString();
            await tx.query('UPDATE key_value_store SET `value` = ? WHERE `key` = ?', [JSON.stringify(profile), key]);
            await tx.query(
                'UPDATE community_shop_products SET sold_count = GREATEST(0, sold_count - ?), version = version + 1, updated_at = NOW(3) WHERE product_id = ?',
                [purchase.quantity, purchase.product_id]
            );
            await tx.query(
                `UPDATE community_shop_purchases SET status = 'refunded', failure_reason = ?, updated_at = NOW(3)
                 WHERE purchase_id = ?`,
                [String(reason || 'role_delivery_failed').slice(0, 255), purchaseId]
            );
        });
        gachaStore.invalidateProfileCache(guildId, userId);
    }

    async function purchase(guildId, userId, raw, deliverRole) {
        const productId = String(raw.productId || '').trim();
        const idempotencyKey = String(raw.idempotencyKey || '').trim();
        const quantity = intInRange(raw.quantity ?? 1, 1, 20);
        if (!/^[0-9a-f-]{36}$/i.test(productId)) throw new CommunityShopError('INVALID_PRODUCT', 'Producto inválido');
        if (!/^[A-Za-z0-9_-]{16,64}$/.test(idempotencyKey)) {
            throw new CommunityShopError('INVALID_IDEMPOTENCY_KEY', 'Clave de compra inválida');
        }
        if (!quantity) throw new CommunityShopError('INVALID_QUANTITY', 'Cantidad inválida');

        const preflight = await db.query(
            'SELECT product_type, role_id FROM community_shop_products WHERE guild_id = ? AND product_id = ?',
            [String(guildId), productId]
        );
        if (!preflight[0]) {
            const config = await gachaStore.getConfig(guildId);
            const catalog = await gachaStore.getShopCatalog(guildId, config);
            const character = catalog.find((item) => gachaProductId(item.id) === productId);
            if (!character) throw new CommunityShopError('PRODUCT_NOT_FOUND', 'Producto no encontrado', 404);
            return purchaseGachaCharacter(guildId, userId, character.id, quantity, idempotencyKey);
        }
        let roleValidation = null;
        if (preflight[0].product_type === 'role' && typeof deliverRole?.validate === 'function') {
            roleValidation = await deliverRole.validate(String(preflight[0].role_id));
        }

        let outcome = await db.transaction(async (tx) => {
            const profileKey = `gacha_profile_${guildId}_${userId}`;
            const seed = gachaStore.normalizeProfile(gachaStore.defaultProfile(userId), userId);
            await tx.query(
                'INSERT IGNORE INTO key_value_store (`key`, `value`) VALUES (?, ?)',
                [profileKey, JSON.stringify(seed)]
            );
            const profileRows = await tx.query(
                'SELECT `value` FROM key_value_store WHERE `key` = ? FOR UPDATE',
                [profileKey]
            );
            const profile = gachaStore.normalizeProfile(parseJson(profileRows[0]?.value, seed), userId);
            const duplicate = await tx.query(
                `SELECT * FROM community_shop_purchases
                 WHERE guild_id = ? AND user_id = ? AND idempotency_key = ? FOR UPDATE`,
                [String(guildId), String(userId), idempotencyKey]
            );
            if (duplicate[0]) {
                if (!PURCHASE_STATUSES.has(String(duplicate[0].status))) {
                    throw new CommunityShopError('PURCHASE_INVALID', 'Estado de compra inválido', 500);
                }
                return { purchase: duplicate[0], idempotent: true };
            }
            const products = await tx.query(
                'SELECT * FROM community_shop_products WHERE guild_id = ? AND product_id = ? FOR UPDATE',
                [String(guildId), productId]
            );
            const product = products[0];
            if (!product || !product.active) throw new CommunityShopError('PRODUCT_UNAVAILABLE', 'Producto no disponible', 410);
            if (product.product_type === 'role' && roleValidation?.alreadyOwned) {
                throw new CommunityShopError('ROLE_ALREADY_OWNED', 'Ya tienes este rol', 409);
            }
            if (product.product_type === 'role' && quantity !== 1) {
                throw new CommunityShopError('INVALID_QUANTITY', 'Los roles se compran de uno en uno');
            }
            const remaining = product.stock_total === null
                ? null
                : Number(product.stock_total) - Number(product.sold_count);
            if (remaining !== null && remaining < quantity) {
                throw new CommunityShopError('OUT_OF_STOCK', 'No hay stock suficiente', 409);
            }
            const totals = await tx.query(
                `SELECT COALESCE(SUM(quantity), 0) AS quantity
                 FROM community_shop_purchases
                 WHERE guild_id = ? AND user_id = ? AND product_id = ?
                   AND status IN ('pending','completed')`,
                [String(guildId), String(userId), productId]
            );
            const purchased = Number(totals[0]?.quantity) || 0;
            if (product.per_user_limit !== null && purchased + quantity > Number(product.per_user_limit)) {
                throw new CommunityShopError('PURCHASE_LIMIT_REACHED', 'Alcanzaste el límite de compra', 409);
            }
            const unitPrice = Number(product.price_coins);
            const totalPrice = unitPrice * quantity;
            if (!Number.isSafeInteger(totalPrice) || totalPrice < 1) {
                throw new CommunityShopError('INVALID_PRODUCT_PRICE', 'Precio inválido', 500);
            }

            if (profile.coins < totalPrice) {
                throw new CommunityShopError('INSUFFICIENT_BALANCE', 'No tienes suficientes EyedCoins', 409);
            }
            const delivery = { type: String(product.product_type) };
            if (product.product_type === 'character') {
                const character = gachaStore.getCharacterPool().find((item) => item.id === String(product.character_id));
                if (!character) throw new CommunityShopError('CHARACTER_NOT_FOUND', 'Personaje no disponible', 410);
                if (profile.inventory.length + quantity > 2000) {
                    throw new CommunityShopError('INVENTORY_FULL', 'Tu inventario está lleno', 409);
                }
                const entries = Array.from({ length: quantity }, () => gachaStore.buildInventoryEntry(character));
                profile.inventory.unshift(...entries);
                profile.collectionCount = profile.inventory.length;
                delivery.characterUids = entries.map((entry) => entry.uid);
            } else if (product.product_type === 'item') {
                await tx.query(
                    `INSERT INTO community_shop_inventory
                        (guild_id, user_id, product_id, quantity, metadata, updated_at)
                     VALUES (?, ?, ?, ?, ?, NOW(3))
                     ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity),
                        metadata = VALUES(metadata), updated_at = VALUES(updated_at)`,
                    [
                        String(guildId), String(userId), productId, quantity,
                        JSON.stringify({ itemKey: product.item_key, name: product.name })
                    ]
                );
                delivery.itemKey = String(product.item_key);
            } else {
                delivery.roleId = String(product.role_id);
            }
            profile.coins -= totalPrice;
            profile.updatedAt = new Date().toISOString();
            await tx.query(
                'UPDATE key_value_store SET `value` = ? WHERE `key` = ?',
                [JSON.stringify(profile), profileKey]
            );
            await tx.query(
                `UPDATE community_shop_products SET sold_count = sold_count + ?,
                    version = version + 1, updated_at = NOW(3)
                 WHERE product_id = ?`,
                [quantity, productId]
            );
            const purchaseId = crypto.randomUUID();
            const status = product.product_type === 'role' ? 'pending' : 'completed';
            const now = new Date();
            await tx.query(
                `INSERT INTO community_shop_purchases
                    (purchase_id, guild_id, user_id, product_id, idempotency_key, quantity,
                     unit_price, total_price, status, delivery_json, created_at, completed_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    purchaseId, String(guildId), String(userId), productId, idempotencyKey,
                    quantity, unitPrice, totalPrice, status, JSON.stringify(delivery), now,
                    status === 'completed' ? now : null, now
                ]
            );
            return {
                purchase: {
                    purchase_id: purchaseId,
                    product_id: productId,
                    quantity,
                    total_price: totalPrice,
                    status,
                    delivery_json: delivery
                },
                idempotent: false,
                balance: profile.coins
            };
        });

        const purchase = outcome.purchase;
        const delivery = parseJson(purchase.delivery_json, purchase.delivery_json || {});
        if (purchase.status === 'pending' && delivery?.roleId) {
            try {
                await deliverRole.apply(delivery.roleId);
            } catch (error) {
                await refundRolePurchase(guildId, userId, purchase.purchase_id, error?.message || error);
                throw new CommunityShopError('ROLE_DELIVERY_FAILED', 'No se pudo entregar el rol; se reembolsaron tus monedas', 409);
            }
            try {
                await db.query(
                    `UPDATE community_shop_purchases SET status = 'completed',
                        completed_at = NOW(3), updated_at = NOW(3)
                     WHERE purchase_id = ? AND status = 'pending'`,
                    [purchase.purchase_id]
                );
                purchase.status = 'completed';
            } catch (error) {
                throw new CommunityShopError(
                    'PURCHASE_FINALIZATION_FAILED',
                    'El rol fue entregado, pero la compra aún debe confirmarse; vuelve a intentarlo',
                    503
                );
            }
        }
        gachaStore.invalidateProfileCache(guildId, userId);
        if (delivery?.type === 'character') {
            gachaStore.scheduleCommunityEvaluation(guildId, userId);
        }
        if (outcome.balance === undefined) {
            outcome.balance = Number((await gachaStore.getProfile(guildId, userId)).coins) || 0;
        }
        return {
            purchaseId: String(purchase.purchase_id),
            productId: String(purchase.product_id),
            quantity: Number(purchase.quantity),
            spentCoins: Number(purchase.total_price),
            balance: outcome.balance,
            status: String(purchase.status),
            idempotent: outcome.idempotent
        };
    }

    return { list, listAdmin, create, update, archive, remove, purchase };
}

module.exports = {
    PRODUCT_TYPES,
    CATEGORY_PRESETS,
    CommunityShopError,
    validateProduct,
    validateReferences,
    normalizeCategory,
    mapProduct,
    publicProduct,
    gachaProductId,
    mapGachaCatalogProduct,
    createCommunityShopService
};
