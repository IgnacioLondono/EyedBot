const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'gacha-store.json');
const CHARACTERS_PATH = path.join(__dirname, '..', '..', 'data', 'gacha-characters.json');
const CACHE_TTL_MS = Math.max(1000, Number.parseInt(process.env.CONFIG_CACHE_TTL_MS || '60000', 10));
const cache = new Map();

const RARITY_WEIGHTS = [
    { rarity: 'SSR', weight: 3, color: '#f1c40f', emoji: '🌟' },
    { rarity: 'SR', weight: 12, color: '#9b59b6', emoji: '✨' },
    { rarity: 'R', weight: 35, color: '#3498db', emoji: '🔹' },
    { rarity: 'N', weight: 50, color: '#95a5a6', emoji: '▫️' }
];

function cacheGet(key) {
    const cached = cache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
        cache.delete(key);
        return null;
    }
    return cached.value;
}

function cacheSet(key, value) {
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function ensureStore() {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(STORE_PATH)) {
        fs.writeFileSync(STORE_PATH, JSON.stringify({ guilds: {} }, null, 2), 'utf8');
    }
}

function readStore() {
    ensureStore();
    try {
        const raw = fs.readFileSync(STORE_PATH, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        if (!parsed || typeof parsed !== 'object') return { guilds: {} };
        if (!parsed.guilds || typeof parsed.guilds !== 'object') parsed.guilds = {};
        return parsed;
    } catch {
        return { guilds: {} };
    }
}

function writeStore(data) {
    ensureStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function loadCharacterPool() {
    try {
        const raw = fs.readFileSync(CHARACTERS_PATH, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        const list = Array.isArray(parsed.characters) ? parsed.characters : [];
        return list.map((item) => ({
            id: String(item.id || `ch_${Date.now()}`),
            name: String(item.name || 'Unknown'),
            series: String(item.series || 'Original'),
            rarity: ['SSR', 'SR', 'R', 'N'].includes(String(item.rarity || 'N').toUpperCase()) ? String(item.rarity).toUpperCase() : 'N',
            imageUrl: String(item.imageUrl || '').trim(),
            baseValue: Math.max(1, Number.parseInt(`${item.baseValue || 10}`, 10) || 10)
        }));
    } catch {
        return [];
    }
}

const CHARACTER_POOL = loadCharacterPool();

function defaultConfig() {
    return {
        enabled: false,
        channelId: '',
        rollCooldownSec: 60,
        claimCooldownSec: 30,
        claimWindowSec: 120,
        pityThreshold: 30,
        coinsPerClaim: 10,
        updatedAt: new Date().toISOString(),
        updatedBy: 'system'
    };
}

function normalizeConfig(raw = {}) {
    return {
        enabled: raw.enabled === true,
        channelId: String(raw.channelId || '').trim(),
        rollCooldownSec: Math.max(10, Math.min(3600, Number.parseInt(`${raw.rollCooldownSec || 60}`, 10) || 60)),
        claimCooldownSec: Math.max(5, Math.min(1800, Number.parseInt(`${raw.claimCooldownSec || 30}`, 10) || 30)),
        claimWindowSec: Math.max(30, Math.min(600, Number.parseInt(`${raw.claimWindowSec || 120}`, 10) || 120)),
        pityThreshold: Math.max(5, Math.min(200, Number.parseInt(`${raw.pityThreshold || 30}`, 10) || 30)),
        coinsPerClaim: Math.max(1, Math.min(1000, Number.parseInt(`${raw.coinsPerClaim || 10}`, 10) || 10)),
        updatedAt: String(raw.updatedAt || new Date().toISOString()),
        updatedBy: String(raw.updatedBy || 'system')
    };
}

function defaultProfile(userId = '') {
    return {
        userId: String(userId || ''),
        coins: 0,
        totalRolls: 0,
        totalClaims: 0,
        collectionCount: 0,
        inventory: [],
        wishlist: [],
        lastRollAt: 0,
        lastClaimAt: 0,
        pityCounter: 0,
        bestRarity: '',
        updatedAt: new Date().toISOString()
    };
}

function normalizeInventoryItem(raw = {}) {
    return {
        uid: String(raw.uid || `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
        characterId: String(raw.characterId || ''),
        name: String(raw.name || 'Unknown'),
        series: String(raw.series || 'Original'),
        rarity: ['SSR', 'SR', 'R', 'N'].includes(String(raw.rarity || 'N').toUpperCase()) ? String(raw.rarity).toUpperCase() : 'N',
        value: Math.max(1, Number.parseInt(`${raw.value || 10}`, 10) || 10),
        imageUrl: String(raw.imageUrl || '').trim(),
        obtainedAt: Number.parseInt(`${raw.obtainedAt || Date.now()}`, 10) || Date.now()
    };
}

function normalizeProfile(raw = {}, userId = '') {
    const base = defaultProfile(userId);
    const inventory = Array.isArray(raw.inventory) ? raw.inventory.map(normalizeInventoryItem).slice(0, 2000) : [];
    const bestRarity = ['SSR', 'SR', 'R', 'N'].includes(String(raw.bestRarity || '').toUpperCase()) ? String(raw.bestRarity).toUpperCase() : '';
    return {
        userId: String(raw.userId || userId || ''),
        coins: Math.max(0, Number.parseInt(`${raw.coins || 0}`, 10) || 0),
        totalRolls: Math.max(0, Number.parseInt(`${raw.totalRolls || 0}`, 10) || 0),
        totalClaims: Math.max(0, Number.parseInt(`${raw.totalClaims || 0}`, 10) || 0),
        collectionCount: Math.max(0, Number.parseInt(`${raw.collectionCount || inventory.length || 0}`, 10) || 0),
        inventory,
        wishlist: Array.isArray(raw.wishlist) ? raw.wishlist.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean).slice(0, 50) : [],
        lastRollAt: Math.max(0, Number.parseInt(`${raw.lastRollAt || 0}`, 10) || 0),
        lastClaimAt: Math.max(0, Number.parseInt(`${raw.lastClaimAt || 0}`, 10) || 0),
        pityCounter: Math.max(0, Number.parseInt(`${raw.pityCounter || 0}`, 10) || 0),
        bestRarity,
        updatedAt: String(raw.updatedAt || base.updatedAt)
    };
}

function normalizePending(raw = {}) {
    return {
        token: String(raw.token || ''),
        userId: String(raw.userId || ''),
        channelId: String(raw.channelId || ''),
        character: normalizeInventoryItem(raw.character || {}),
        createdAt: Number.parseInt(`${raw.createdAt || Date.now()}`, 10) || Date.now(),
        expiresAt: Number.parseInt(`${raw.expiresAt || Date.now() + 120000}`, 10) || (Date.now() + 120000)
    };
}

function rarityMeta(rarity = 'N') {
    return RARITY_WEIGHTS.find((x) => x.rarity === rarity) || RARITY_WEIGHTS[RARITY_WEIGHTS.length - 1];
}

function rarityRank(rarity = '') {
    const order = { SSR: 4, SR: 3, R: 2, N: 1 };
    return order[String(rarity || '').toUpperCase()] || 0;
}

function pickRarity() {
    const total = RARITY_WEIGHTS.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    for (const item of RARITY_WEIGHTS) {
        roll -= item.weight;
        if (roll <= 0) return item.rarity;
    }
    return 'N';
}

function pickRarityWithPity(pityCounter = 0, pityThreshold = 30) {
    if (pityCounter >= Math.max(1, Number(pityThreshold) || 30)) return 'SSR';
    return pickRarity();
}

function pickCharacterForRarity(rarity) {
    const list = CHARACTER_POOL.filter((item) => item.rarity === rarity);
    const source = list.length ? list : CHARACTER_POOL;
    if (!source.length) return null;
    return source[Math.floor(Math.random() * source.length)];
}

function buildInventoryEntry(character = {}) {
    const variance = Math.max(1, Math.round((Math.random() * 0.35 + 0.85) * Number(character.baseValue || 10)));
    return normalizeInventoryItem({
        uid: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        characterId: character.id,
        name: character.name,
        series: character.series,
        rarity: character.rarity,
        value: variance,
        imageUrl: character.imageUrl,
        obtainedAt: Date.now()
    });
}

async function getConfig(guildId) {
    const key = `gacha_config_${guildId}`;
    const fromCache = cacheGet(key);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(key);
        if (fromDb && typeof fromDb === 'object') {
            const normalized = normalizeConfig(fromDb);
            cacheSet(key, normalized);
            return normalized;
        }
    } catch {}

    const store = readStore();
    const cfg = normalizeConfig(store.guilds[guildId]?.config || defaultConfig());
    cacheSet(key, cfg);
    return cfg;
}

async function setConfig(guildId, config) {
    const normalized = normalizeConfig(config);
    const key = `gacha_config_${guildId}`;

    try { await db.set(key, normalized); } catch {}

    const store = readStore();
    if (!store.guilds[guildId]) store.guilds[guildId] = { config: defaultConfig(), profiles: {}, pending: {} };
    store.guilds[guildId].config = normalized;
    writeStore(store);
    cacheSet(key, normalized);
    return normalized;
}

async function getProfile(guildId, userId) {
    const key = `gacha_profile_${guildId}_${userId}`;
    const fromCache = cacheGet(key);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(key);
        if (fromDb && typeof fromDb === 'object') {
            const normalized = normalizeProfile(fromDb, userId);
            cacheSet(key, normalized);
            return normalized;
        }
    } catch {}

    const store = readStore();
    const raw = store.guilds[guildId]?.profiles?.[userId];
    const normalized = normalizeProfile(raw || defaultProfile(userId), userId);
    cacheSet(key, normalized);
    return normalized;
}

async function setProfile(guildId, userId, profile) {
    const key = `gacha_profile_${guildId}_${userId}`;
    const normalized = normalizeProfile(profile, userId);
    normalized.updatedAt = new Date().toISOString();

    try { await db.set(key, normalized); } catch {}

    const store = readStore();
    if (!store.guilds[guildId]) store.guilds[guildId] = { config: defaultConfig(), profiles: {}, pending: {} };
    if (!store.guilds[guildId].profiles) store.guilds[guildId].profiles = {};
    store.guilds[guildId].profiles[userId] = normalized;
    writeStore(store);
    cacheSet(key, normalized);
    return normalized;
}

async function getPending(guildId, userId) {
    const key = `gacha_pending_${guildId}_${userId}`;
    const fromCache = cacheGet(key);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(key);
        if (fromDb && typeof fromDb === 'object') {
            const normalized = normalizePending(fromDb);
            cacheSet(key, normalized);
            return normalized;
        }
    } catch {}

    const store = readStore();
    const raw = store.guilds[guildId]?.pending?.[userId];
    const normalized = raw ? normalizePending(raw) : null;
    cacheSet(key, normalized);
    return normalized;
}

async function setPending(guildId, userId, pending) {
    const key = `gacha_pending_${guildId}_${userId}`;
    const normalized = normalizePending(pending);

    try { await db.set(key, normalized); } catch {}

    const store = readStore();
    if (!store.guilds[guildId]) store.guilds[guildId] = { config: defaultConfig(), profiles: {}, pending: {} };
    if (!store.guilds[guildId].pending) store.guilds[guildId].pending = {};
    store.guilds[guildId].pending[userId] = normalized;
    writeStore(store);
    cacheSet(key, normalized);
    return normalized;
}

async function clearPending(guildId, userId) {
    const key = `gacha_pending_${guildId}_${userId}`;
    try { await db.delete(key); } catch {}

    const store = readStore();
    if (store.guilds[guildId]?.pending?.[userId]) {
        delete store.guilds[guildId].pending[userId];
        writeStore(store);
    }
    cacheSet(key, null);
}

async function createRoll(guildId, userId, channelId) {
    const config = await getConfig(guildId);
    const profile = await getProfile(guildId, userId);
    const rarity = pickRarityWithPity(profile.pityCounter || 0, config.pityThreshold || 30);
    const character = pickCharacterForRarity(rarity);
    if (!character) return null;

    const inventoryItem = buildInventoryEntry(character);
    const token = `roll_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const pending = {
        token,
        userId,
        channelId,
        character: inventoryItem,
        createdAt: Date.now(),
        expiresAt: Date.now() + (config.claimWindowSec * 1000)
    };

    await setPending(guildId, userId, pending);

    profile.totalRolls += 1;
    profile.lastRollAt = Date.now();
    profile.pityCounter = rarity === 'SSR' ? 0 : ((profile.pityCounter || 0) + 1);
    await setProfile(guildId, userId, profile);

    const wishlistHit = Array.isArray(profile.wishlist) && profile.wishlist.includes(String(character.name || '').toLowerCase());
    return { ...pending, wishlistHit, pityCounter: profile.pityCounter, pityThreshold: config.pityThreshold || 30 };
}

async function claimPendingRoll(guildId, userId, token = '') {
    const pending = await getPending(guildId, userId);
    if (!pending || !pending.token) return { ok: false, reason: 'missing' };
    if (token && pending.token !== token) return { ok: false, reason: 'mismatch' };
    if (Date.now() > pending.expiresAt) {
        await clearPending(guildId, userId);
        return { ok: false, reason: 'expired' };
    }

    const config = await getConfig(guildId);
    const profile = await getProfile(guildId, userId);
    profile.inventory.unshift(normalizeInventoryItem(pending.character));
    profile.collectionCount = profile.inventory.length;
    profile.totalClaims += 1;
    profile.lastClaimAt = Date.now();
    profile.coins += Math.max(1, Number(config.coinsPerClaim || 10));
    const rarity = String(pending.character?.rarity || '').toUpperCase();
    if (!profile.bestRarity || rarityRank(rarity) > rarityRank(profile.bestRarity)) {
        profile.bestRarity = rarity;
    }

    await setProfile(guildId, userId, profile);
    await clearPending(guildId, userId);

    return { ok: true, item: pending.character, profile };
}

async function listGuildProfiles(guildId) {
    const rowsFromDb = [];
    try {
        const rows = await db.query(
            'SELECT `key`, `value` FROM key_value_store WHERE `key` LIKE ?',
            [`gacha_profile_${guildId}_%`]
        );
        for (const row of rows) {
            const key = String(row.key || '');
            const userId = key.replace(`gacha_profile_${guildId}_`, '');
            if (!userId) continue;
            let parsed = null;
            try { parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value; } catch {}
            if (parsed && typeof parsed === 'object') {
                rowsFromDb.push(normalizeProfile(parsed, userId));
            }
        }
    } catch {}

    const store = readStore();
    const fromFile = Object.entries(store.guilds[guildId]?.profiles || {}).map(([userId, raw]) => normalizeProfile(raw || {}, userId));

    const merged = new Map();
    for (const p of fromFile) merged.set(String(p.userId), p);
    for (const p of rowsFromDb) merged.set(String(p.userId), p);
    return Array.from(merged.values());
}

async function getGuildMarket(guildId) {
    const key = `gacha_market_${guildId}`;
    const fromCache = cacheGet(key);
    if (fromCache !== null) return fromCache;

    let market = [];
    try {
        const fromDb = await db.get(key);
        if (Array.isArray(fromDb)) market = fromDb;
    } catch {}

    if (!market.length) {
        const store = readStore();
        market = Array.isArray(store.guilds[guildId]?.market) ? store.guilds[guildId].market : [];
    }

    const normalized = market
        .map((row) => ({
            id: String(row.id || `mk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
            sellerId: String(row.sellerId || ''),
            item: normalizeInventoryItem(row.item || {}),
            price: Math.max(1, Number.parseInt(`${row.price || 1}`, 10) || 1),
            createdAt: Number.parseInt(`${row.createdAt || Date.now()}`, 10) || Date.now()
        }))
        .filter((row) => row.sellerId && row.item?.uid);

    cacheSet(key, normalized);
    return normalized;
}

async function setGuildMarket(guildId, market = []) {
    const key = `gacha_market_${guildId}`;
    const normalized = (Array.isArray(market) ? market : []).slice(0, 500);
    try { await db.set(key, normalized); } catch {}

    const store = readStore();
    if (!store.guilds[guildId]) store.guilds[guildId] = { config: defaultConfig(), profiles: {}, pending: {}, market: [] };
    store.guilds[guildId].market = normalized;
    writeStore(store);
    cacheSet(key, normalized);
    return normalized;
}

async function addWishlistItem(guildId, userId, query = '') {
    const profile = await getProfile(guildId, userId);
    const value = String(query || '').trim().toLowerCase();
    if (!value) return profile;
    if (!profile.wishlist.includes(value)) profile.wishlist.push(value);
    profile.wishlist = profile.wishlist.slice(0, 50);
    return setProfile(guildId, userId, profile);
}

async function removeWishlistItem(guildId, userId, query = '') {
    const profile = await getProfile(guildId, userId);
    const value = String(query || '').trim().toLowerCase();
    profile.wishlist = (profile.wishlist || []).filter((x) => x !== value);
    return setProfile(guildId, userId, profile);
}

function filterInventoryItems(items = [], filters = {}) {
    const rarity = String(filters.rarity || '').toUpperCase();
    const series = String(filters.series || '').trim().toLowerCase();
    const q = String(filters.q || '').trim().toLowerCase();

    return (Array.isArray(items) ? items : []).filter((item) => {
        if (rarity && item.rarity !== rarity) return false;
        if (series && String(item.series || '').toLowerCase() !== series) return false;
        if (q) {
            const hay = `${item.name || ''} ${item.series || ''} ${item.rarity || ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
}

async function listInventory(guildId, userId, filters = {}) {
    const profile = await getProfile(guildId, userId);
    const filtered = filterInventoryItems(profile.inventory || [], filters);
    return {
        userId,
        total: (profile.inventory || []).length,
        filteredTotal: filtered.length,
        items: filtered.slice(0, Math.max(1, Math.min(500, Number.parseInt(`${filters.limit || 100}`, 10) || 100)))
    };
}

async function createMarketListing(guildId, sellerId, itemUid, price) {
    const numericPrice = Math.max(1, Number.parseInt(`${price || 1}`, 10) || 1);
    const seller = await getProfile(guildId, sellerId);
    const index = (seller.inventory || []).findIndex((x) => x.uid === itemUid);
    if (index < 0) return { ok: false, reason: 'item_not_found' };

    const [item] = seller.inventory.splice(index, 1);
    seller.collectionCount = seller.inventory.length;
    await setProfile(guildId, sellerId, seller);

    const market = await getGuildMarket(guildId);
    const listing = {
        id: `mk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        sellerId,
        item: normalizeInventoryItem(item),
        price: numericPrice,
        createdAt: Date.now()
    };
    market.unshift(listing);
    await setGuildMarket(guildId, market);
    return { ok: true, listing };
}

async function buyMarketListing(guildId, buyerId, listingId) {
    const market = await getGuildMarket(guildId);
    const idx = market.findIndex((x) => x.id === listingId);
    if (idx < 0) return { ok: false, reason: 'listing_not_found' };
    const listing = market[idx];
    if (listing.sellerId === buyerId) return { ok: false, reason: 'self_buy' };

    const buyer = await getProfile(guildId, buyerId);
    if ((buyer.coins || 0) < listing.price) return { ok: false, reason: 'insufficient_funds' };
    const seller = await getProfile(guildId, listing.sellerId);

    buyer.coins -= listing.price;
    buyer.inventory.unshift(normalizeInventoryItem(listing.item));
    buyer.collectionCount = buyer.inventory.length;
    if (!buyer.bestRarity || rarityRank(listing.item.rarity) > rarityRank(buyer.bestRarity)) {
        buyer.bestRarity = listing.item.rarity;
    }

    seller.coins += listing.price;
    await setProfile(guildId, buyerId, buyer);
    await setProfile(guildId, listing.sellerId, seller);

    market.splice(idx, 1);
    await setGuildMarket(guildId, market);
    return { ok: true, listing, buyer, seller };
}

async function getGuildStats(guildId) {
    const profiles = await listGuildProfiles(guildId);
    const sorted = profiles.slice().sort((a, b) => (b.totalClaims || 0) - (a.totalClaims || 0));
    const totalRolls = profiles.reduce((sum, x) => sum + (x.totalRolls || 0), 0);
    const totalClaims = profiles.reduce((sum, x) => sum + (x.totalClaims || 0), 0);
    const totalCollection = profiles.reduce((sum, x) => sum + (x.collectionCount || 0), 0);
    const richest = profiles.slice().sort((a, b) => (b.coins || 0) - (a.coins || 0))[0] || null;
    return {
        totalUsers: profiles.length,
        totalRolls,
        totalClaims,
        totalCollection,
        topClaimers: sorted.slice(0, 10),
        richestUser: richest
    };
}

module.exports = {
    CHARACTER_POOL,
    RARITY_WEIGHTS,
    rarityMeta,
    defaultConfig,
    normalizeConfig,
    getConfig,
    setConfig,
    getProfile,
    setProfile,
    getPending,
    createRoll,
    claimPendingRoll,
    listInventory,
    addWishlistItem,
    removeWishlistItem,
    getGuildMarket,
    createMarketListing,
    buyMarketListing,
    listGuildProfiles,
    getGuildStats
};
