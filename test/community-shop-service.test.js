const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    CommunityShopError,
    validateProduct,
    validateReferences
} = require('../src/utils/community-shop-service');

test('valida productos con stock opcional y límites explícitos', () => {
    const product = validateReferences(validateProduct({
        type: 'item',
        name: 'Ticket dorado',
        description: 'Objeto canjeable',
        priceCoins: 250,
        stock: null,
        perUserLimit: 3,
        itemKey: 'ticket_dorado',
        active: true
    }));
    assert.equal(product.type, 'item');
    assert.equal(product.stock, null);
    assert.equal(product.perUserLimit, 3);
    assert.equal(product.itemKey, 'ticket_dorado');
});

test('los roles siempre se limitan a una compra por usuario', () => {
    const product = validateReferences(validateProduct({
        type: 'role',
        name: 'Rol VIP',
        priceCoins: 1000,
        roleId: '123456789012345678',
        perUserLimit: 20
    }));
    assert.equal(product.perUserLimit, 1);
    assert.equal(product.roleId, '123456789012345678');
});

test('rechaza imágenes y referencias de producto inseguras', () => {
    assert.throws(
        () => validateProduct({ type: 'item', name: 'Objeto', priceCoins: 1, itemKey: 'ok', imageUrl: 'javascript:alert(1)' }),
        (error) => error instanceof CommunityShopError && error.code === 'INVALID_IMAGE_URL'
    );
    assert.throws(
        () => validateReferences(validateProduct({ type: 'character', name: 'Fantasma', priceCoins: 1, characterId: 'missing' })),
        (error) => error instanceof CommunityShopError && error.code === 'CHARACTER_NOT_FOUND'
    );
});

test('compra serializa por perfil y persiste idempotencia única', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'utils', 'community-shop-service.js'),
        'utf8'
    );
    const profileLock = source.indexOf("SELECT `value` FROM key_value_store WHERE `key` = ? FOR UPDATE");
    const duplicateLock = source.indexOf('idempotency_key = ? FOR UPDATE');
    assert.ok(profileLock >= 0 && duplicateLock > profileLock);

    const schema = fs.readFileSync(
        path.join(__dirname, '..', 'docker', 'mysql', 'community-shop-v1.sql'),
        'utf8'
    );
    assert.match(schema, /UNIQUE KEY uq_community_shop_idempotency \(guild_id, user_id, idempotency_key\)/);
    assert.match(source, /status = 'refunded'/);
    assert.match(source, /sold_count = GREATEST\(0, sold_count - \?\)/);
});

test('normaliza categorías de tienda a claves estables', () => {
    const { normalizeCategory } = require('../src/utils/community-shop-service');
    assert.equal(normalizeCategory(' Cosméticos '), 'cosmeticos');
    assert.equal(normalizeCategory(''), 'general');
});
