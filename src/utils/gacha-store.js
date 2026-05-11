const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'gacha-store.json');
const CHARACTERS_PATH = path.join(__dirname, '..', '..', 'data', 'gacha-characters.json');
const BUNDLED_CHARACTERS_PATH = path.join(__dirname, '..', 'bundled', 'gacha-characters.json');
const SYSTEM_MARKET_SELLER_ID = 'system';
const DEFAULT_MARKET_LISTING_COUNT = 16;

const FALLBACK_CHARACTERS = [
    { id: 'ch_fb_001', name: 'Aira Nova', series: 'Celestial Archive', rarity: 'SSR', baseValue: 500 },
    { id: 'ch_fb_002', name: 'Kael Draven', series: 'Celestial Archive', rarity: 'SR', baseValue: 180 },
    { id: 'ch_fb_003', name: 'Mira Elowen', series: 'Moonlit Engine', rarity: 'R', baseValue: 70 },
    { id: 'ch_fb_004', name: 'Ren Azuki', series: 'Moonlit Engine', rarity: 'N', baseValue: 25 },
    { id: 'ch_fb_005', name: 'Eyed Sentinel', series: 'EyedBot Collection', rarity: 'SSR', baseValue: 640 },
    { id: 'ch_fb_006', name: 'Eyed Courier', series: 'EyedBot Collection', rarity: 'SR', baseValue: 195 },
    { id: 'ch_fb_007', name: 'Eyed Scout', series: 'EyedBot Collection', rarity: 'R', baseValue: 88 },
    { id: 'ch_fb_008', name: 'Eyed Spark', series: 'EyedBot Collection', rarity: 'N', baseValue: 28 }
];
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

function resolveCharactersPath() {
    const candidates = [
        CHARACTERS_PATH,
        BUNDLED_CHARACTERS_PATH,
        path.join(process.cwd(), 'data', 'gacha-characters.json'),
        path.join(__dirname, '..', 'data', 'gacha-characters.json'),
        path.join(process.cwd(), '..', 'data', 'gacha-characters.json')
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }

    return CHARACTERS_PATH;
}

function buildDefaultCharacterDescription(character = {}) {
    const name = String(character.name || 'Artefacto').trim();
    const series = String(character.series || 'Colección desconocida').trim();
    const rarity = ['SSR', 'SR', 'R', 'N'].includes(String(character.rarity || 'N').toUpperCase())
        ? String(character.rarity).toUpperCase()
        : 'N';
    const flavor = {
        SSR: `Reliquia ${name} forjada en el umbral de ${series}. Se dice que despierta portales antiguos y que solo unos pocos elegidos pueden portarla sin perder el juicio.`,
        SR: `Emblema místico de ${series}. ${name} canaliza siglos de conjuros dormidos y deja un rastro de ceniza arcana tras cada misión.`,
        R: `Curio ritual descubierto en ${series}. ${name} aún guarda ecos de un juramento sellado antes del Descenso.`,
        N: `Fetiche reciente de ${series}. ${name} pulsa con una duda luminosa y enseña el primer paso hacia lo oculto.`
    };

    return flavor[rarity] || flavor.N;
}

function normalizeCharacterRecord(item = {}) {
    const id = String(item.id || `ch_${Date.now()}`);
    const name = String(item.name || 'Unknown');
    const series = String(item.series || 'Original');
    const rarity = ['SSR', 'SR', 'R', 'N'].includes(String(item.rarity || 'N').toUpperCase()) ? String(item.rarity).toUpperCase() : 'N';
    const description = String(item.description || '').trim() || buildDefaultCharacterDescription({ name, series, rarity });

    return {
        id,
        name,
        series,
        rarity,
        description,
        baseValue: Math.max(1, Number.parseInt(`${item.baseValue || 10}`, 10) || 10)
    };
}

function applyCatalogOverride(character = {}, override = {}) {
    if (!override || typeof override !== 'object') return normalizeCharacterRecord(character);
    return normalizeCharacterRecord({
        ...character,
        ...override,
        id: character.id
    });
}

function normalizeCatalogOverride(raw = {}, base = {}) {
    const patch = {};
    if (raw.name !== undefined) patch.name = String(raw.name || '').trim().slice(0, 80);
    if (raw.series !== undefined) patch.series = String(raw.series || '').trim().slice(0, 120);
    if (raw.description !== undefined) patch.description = String(raw.description || '').trim().slice(0, 900);
    if (raw.baseValue !== undefined) {
        patch.baseValue = Math.max(1, Number.parseInt(`${raw.baseValue || base.baseValue || 10}`, 10) || 1);
    }
    if (raw.rarity !== undefined) {
        const rarity = String(raw.rarity || base.rarity || 'N').toUpperCase();
        if (['SSR', 'SR', 'R', 'N'].includes(rarity)) patch.rarity = rarity;
    }
    return patch;
}

function ensureCharacterCatalogFile() {
    const filePath = resolveCharactersPath();

    try {
        if (fs.existsSync(filePath)) {
            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8') || '{}');
            if (Array.isArray(parsed.characters) && parsed.characters.length) return;
        }
    } catch {}

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    for (const sourcePath of [CHARACTERS_PATH, BUNDLED_CHARACTERS_PATH]) {
        if (sourcePath === filePath || !fs.existsSync(sourcePath)) continue;
        try {
            fs.copyFileSync(sourcePath, filePath);
            return;
        } catch {}
    }

    try {
        fs.writeFileSync(
            filePath,
            JSON.stringify({ characters: FALLBACK_CHARACTERS }, null, 2),
            'utf8'
        );
    } catch (error) {
        console.warn('[gacha-store] No se pudo crear el catálogo local:', error?.message || error);
    }
}

function loadCharacterPool() {
    ensureCharacterCatalogFile();
    const filePath = resolveCharactersPath();

    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        const list = Array.isArray(parsed.characters) ? parsed.characters : [];
        const normalized = list.map(normalizeCharacterRecord).filter((item) => item.id && item.name);
        if (normalized.length) return normalized;
    } catch (error) {
        console.warn('[gacha-store] No se pudo leer el catálogo de personajes:', error?.message || error);
    }

    return FALLBACK_CHARACTERS.map(normalizeCharacterRecord);
}

let characterPoolCache = {
    mtimeMs: 0,
    items: []
};

function getCharacterPool() {
    const filePath = resolveCharactersPath();

    try {
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs !== characterPoolCache.mtimeMs || !characterPoolCache.items.length) {
            characterPoolCache = {
                mtimeMs: stat.mtimeMs,
                items: loadCharacterPool()
            };
        }
    } catch {
        if (!characterPoolCache.items.length) {
            characterPoolCache = {
                mtimeMs: 0,
                items: loadCharacterPool()
            };
        }
    }

    if (!characterPoolCache.items.length) {
        characterPoolCache = {
            mtimeMs: 0,
            items: FALLBACK_CHARACTERS.map(normalizeCharacterRecord)
        };
    }

    return characterPoolCache.items;
}

function defaultConfig() {
    return {
        enabled: false,
        channelId: '',
        rollCooldownSec: 60,
        claimCooldownSec: 30,
        claimWindowSec: 120,
        pityThreshold: 30,
        coinsPerClaim: 10,
        economyEnabled: false,
        shopEnabled: true,
        coinsPerXp: 1,
        coinsPerLevelUp: 75,
        coinsPerVoiceMinute: 1,
        shopPriceMultiplier: 2,
        minigameCoinflipReward: 8,
        minigameDiceReward: 6,
        minigameTriviaReward: 18,
        minigameCooldownSec: 45,
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
        economyEnabled: raw.economyEnabled === true,
        shopEnabled: raw.shopEnabled !== false,
        coinsPerXp: Math.max(0, Math.min(100, Number.parseInt(`${raw.coinsPerXp ?? 1}`, 10) || 0)),
        coinsPerLevelUp: Math.max(0, Math.min(5000, Number.parseInt(`${raw.coinsPerLevelUp ?? 75}`, 10) || 0)),
        coinsPerVoiceMinute: Math.max(0, Math.min(100, Number.parseInt(`${raw.coinsPerVoiceMinute ?? 1}`, 10) || 0)),
        shopPriceMultiplier: Math.max(0.5, Math.min(10, Number.parseFloat(`${raw.shopPriceMultiplier ?? 2}`) || 2)),
        minigameCoinflipReward: Math.max(0, Math.min(1000, Number.parseInt(`${raw.minigameCoinflipReward ?? 8}`, 10) || 0)),
        minigameDiceReward: Math.max(0, Math.min(1000, Number.parseInt(`${raw.minigameDiceReward ?? 6}`, 10) || 0)),
        minigameTriviaReward: Math.max(0, Math.min(5000, Number.parseInt(`${raw.minigameTriviaReward ?? 18}`, 10) || 0)),
        minigameCooldownSec: Math.max(5, Math.min(3600, Number.parseInt(`${raw.minigameCooldownSec ?? 45}`, 10) || 45)),
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
    const name = String(raw.name || 'Unknown');
    const series = String(raw.series || 'Original');
    const rarity = ['SSR', 'SR', 'R', 'N'].includes(String(raw.rarity || 'N').toUpperCase()) ? String(raw.rarity).toUpperCase() : 'N';
    const description = String(raw.description || '').trim() || buildDefaultCharacterDescription({ name, series, rarity });

    return {
        uid: String(raw.uid || `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
        characterId: String(raw.characterId || ''),
        name,
        series,
        rarity,
        description,
        value: Math.max(1, Number.parseInt(`${raw.value || 10}`, 10) || 10),
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
    const pool = getCharacterPool();
    const list = pool.filter((item) => item.rarity === rarity);
    const source = list.length ? list : pool;
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
        description: character.description,
        value: variance,
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
            source: String(row.source || ''),
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
    const isSystemListing = listing.sellerId === SYSTEM_MARKET_SELLER_ID;
    const seller = isSystemListing ? null : await getProfile(guildId, listing.sellerId);

    buyer.coins -= listing.price;
    buyer.inventory.unshift(normalizeInventoryItem(listing.item));
    buyer.collectionCount = buyer.inventory.length;
    if (!buyer.bestRarity || rarityRank(listing.item.rarity) > rarityRank(buyer.bestRarity)) {
        buyer.bestRarity = listing.item.rarity;
    }

    await setProfile(guildId, buyerId, buyer);
    if (seller) {
        seller.coins += listing.price;
        await setProfile(guildId, listing.sellerId, seller);
    }

    market.splice(idx, 1);
    await setGuildMarket(guildId, market);
    return { ok: true, listing, buyer, seller };
}

function getShopPrice(character = {}, config = {}) {
    const multiplier = Math.max(0.5, Number(config.shopPriceMultiplier || 2));
    const base = Math.max(1, Number.parseInt(`${character.baseValue || 10}`, 10) || 10);
    const rarityBoost = { SSR: 2.4, SR: 1.8, R: 1.35, N: 1 };
    const boost = rarityBoost[String(character.rarity || 'N').toUpperCase()] || 1;
    return Math.max(1, Math.round(base * multiplier * boost));
}

async function getGuildCatalogOverrides(guildId) {
    const key = `gacha_catalog_${guildId}`;
    const fromCache = cacheGet(key);
    if (fromCache !== null) return fromCache;

    let overrides = {};
    try {
        const fromDb = await db.get(key);
        if (fromDb && typeof fromDb === 'object' && !Array.isArray(fromDb)) {
            overrides = fromDb;
        }
    } catch {}

    if (!Object.keys(overrides).length) {
        const store = readStore();
        const fromFile = store.guilds[guildId]?.catalog;
        if (fromFile && typeof fromFile === 'object' && !Array.isArray(fromFile)) {
            overrides = fromFile;
        }
    }

    cacheSet(key, overrides);
    return overrides;
}

async function setGuildCatalogOverrides(guildId, overrides = {}) {
    const key = `gacha_catalog_${guildId}`;
    const normalized = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
    try { await db.set(key, normalized); } catch {}

    const store = readStore();
    if (!store.guilds[guildId]) {
        store.guilds[guildId] = { config: defaultConfig(), profiles: {}, pending: {}, market: [], catalog: {} };
    }
    store.guilds[guildId].catalog = normalized;
    writeStore(store);
    cacheSet(key, normalized);
    return normalized;
}

async function getGuildCharacterPool(guildId) {
    const base = getCharacterPool();
    if (!guildId) return base;

    const overrides = await getGuildCatalogOverrides(guildId);
    return base.map((character) => applyCatalogOverride(character, overrides[character.id]));
}

async function getShopCatalog(guildId, config = {}) {
    const pool = await getGuildCharacterPool(guildId);
    return pool.map((character) => ({
        ...character,
        price: getShopPrice(character, config)
    })).sort((left, right) => getShopPrice(right, config) - getShopPrice(left, config));
}

function buildCatalogMarketItem(character = {}) {
    return normalizeInventoryItem({
        uid: `seed_${character.id}`,
        characterId: character.id,
        name: character.name,
        series: character.series,
        rarity: character.rarity,
        description: character.description,
        value: character.baseValue,
        obtainedAt: Date.now()
    });
}

async function setGuildCatalogItem(guildId, characterId = '', rawPatch = {}, updatedBy = 'system') {
    const base = getCharacterPool().find((item) => item.id === String(characterId || ''));
    if (!base) return { ok: false, reason: 'item_not_found' };

    const patch = normalizeCatalogOverride(rawPatch, base);
    if (!Object.keys(patch).length) return { ok: false, reason: 'empty_patch' };

    const overrides = await getGuildCatalogOverrides(guildId);
    const nextEntry = {
        ...(overrides[base.id] || {}),
        ...patch,
        updatedAt: new Date().toISOString(),
        updatedBy: String(updatedBy || 'system')
    };
    overrides[base.id] = nextEntry;
    await setGuildCatalogOverrides(guildId, overrides);

    return {
        ok: true,
        item: applyCatalogOverride(base, nextEntry)
    };
}

async function ensureGuildEconomyContent(guildId) {
    const config = await getConfig(guildId);
    const catalog = await getShopCatalog(guildId, config);
    if (!catalog.length) return;

    const market = await getGuildMarket(guildId);
    const byCharacterId = new Map(catalog.map((character) => [character.id, character]));
    let marketChanged = false;

    for (const row of market) {
        if (row.sellerId !== SYSTEM_MARKET_SELLER_ID) continue;
        const character = byCharacterId.get(String(row.item?.characterId || ''));
        if (!character) continue;
        const nextItem = buildCatalogMarketItem(character);
        const current = normalizeInventoryItem(row.item || {});
        if (current.name !== nextItem.name
            || current.series !== nextItem.series
            || current.rarity !== nextItem.rarity
            || current.description !== nextItem.description) {
            row.item = nextItem;
            marketChanged = true;
        }
    }

    const systemListings = market.filter((row) => row.sellerId === SYSTEM_MARKET_SELLER_ID);
    if (systemListings.length < 8) {
        const listedCharacterIds = new Set(
            market
                .map((row) => row.item?.characterId)
                .filter(Boolean)
        );

        const seeded = catalog
            .filter((character) => !listedCharacterIds.has(character.id))
            .slice(0, DEFAULT_MARKET_LISTING_COUNT)
            .map((character, index) => ({
                id: `mk_seed_${character.id}`,
                sellerId: SYSTEM_MARKET_SELLER_ID,
                source: 'catalog',
                item: buildCatalogMarketItem(character),
                price: Math.max(1, Math.round((character.price || getShopPrice(character, config)) * 0.9)),
                createdAt: Date.now() - index * 120000
            }));

        if (seeded.length) {
            await setGuildMarket(guildId, [...seeded, ...market]);
            return;
        }
    }

    if (marketChanged) {
        await setGuildMarket(guildId, market);
    }
}

async function addCoins(guildId, userId, amount = 0) {
    const delta = Math.max(0, Number.parseInt(`${amount || 0}`, 10) || 0);
    if (!delta) return getProfile(guildId, userId);

    const profile = await getProfile(guildId, userId);
    profile.coins = Math.max(0, (profile.coins || 0) + delta);
    return setProfile(guildId, userId, profile);
}

async function trySpendCoins(guildId, userId, amount = 0) {
    const cost = Math.max(0, Number.parseInt(`${amount || 0}`, 10) || 0);
    const profile = await getProfile(guildId, userId);
    if ((profile.coins || 0) < cost) {
        return { ok: false, reason: 'insufficient_funds', profile };
    }

    profile.coins -= cost;
    const saved = await setProfile(guildId, userId, profile);
    return { ok: true, profile: saved };
}

async function purchaseShopCharacter(guildId, userId, characterId = '') {
    const config = await getConfig(guildId);
    if (!config.economyEnabled || config.shopEnabled === false) {
        return { ok: false, reason: 'shop_disabled' };
    }

    const pool = await getGuildCharacterPool(guildId);
    const character = pool.find((item) => item.id === String(characterId || ''));
    if (!character) return { ok: false, reason: 'item_not_found' };

    const price = getShopPrice(character, config);
    const spend = await trySpendCoins(guildId, userId, price);
    if (!spend.ok) return { ok: false, reason: spend.reason, price, profile: spend.profile };

    const profile = await getProfile(guildId, userId);
    const item = buildInventoryEntry(character);
    profile.inventory.unshift(item);
    profile.collectionCount = profile.inventory.length;
    const rarity = String(item.rarity || '').toUpperCase();
    if (!profile.bestRarity || rarityRank(rarity) > rarityRank(profile.bestRarity)) {
        profile.bestRarity = rarity;
    }

    await setProfile(guildId, userId, profile);
    return { ok: true, item, price, profile };
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
    getCharacterPool,
    get CHARACTER_POOL() {
        return getCharacterPool();
    },
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
    getGuildStats,
    getShopPrice,
    getShopCatalog,
    getGuildCharacterPool,
    setGuildCatalogItem,
    ensureGuildEconomyContent,
    addCoins,
    trySpendCoins,
    purchaseShopCharacter
};
