const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'gacha-store.json');
const CHARACTERS_PATH = path.join(__dirname, '..', '..', 'data', 'gacha-characters.json');
const BUNDLED_CHARACTERS_PATH = path.join(__dirname, '..', 'bundled', 'gacha-characters.json');
const SYSTEM_MARKET_SELLER_ID = 'system';
const DEFAULT_MARKET_LISTING_COUNT = 16;
const MAX_SHOP_CATALOG_IMAGE_BYTES = 8 * 1024 * 1024;
const SHOP_CATALOG_UPLOAD_DIR = path.join(__dirname, '..', '..', 'web', 'uploads', 'gacha-catalog');

function ensureShopCatalogUploadDir() {
    if (!fs.existsSync(SHOP_CATALOG_UPLOAD_DIR)) {
        fs.mkdirSync(SHOP_CATALOG_UPLOAD_DIR, { recursive: true });
    }
    return SHOP_CATALOG_UPLOAD_DIR;
}

function shopCatalogDiskSafePart(raw = '', max = 80) {
    return String(raw || '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, max) || 'item';
}

function shopCatalogDiskFilePath(guildId, characterId, ext = 'png') {
    const gid = shopCatalogDiskSafePart(guildId, 32);
    const cidEnc = encodeURIComponent(String(characterId || '').trim().slice(0, 128));
    const e = String(ext || 'png').replace(/^\./, '').toLowerCase();
    return path.join(ensureShopCatalogUploadDir(), `${gid}__${cidEnc}.${e}`);
}

function shopCatalogDiskPrefix(guildId) {
    return `${shopCatalogDiskSafePart(guildId, 32)}__`;
}

function characterIdFromShopDiskFile(guildId, fileName) {
    const prefix = shopCatalogDiskPrefix(guildId);
    if (!String(fileName || '').startsWith(prefix)) return '';
    const rest = String(fileName).slice(prefix.length);
    const dot = rest.lastIndexOf('.');
    const enc = dot > 0 ? rest.slice(0, dot) : rest;
    try {
        return decodeURIComponent(enc);
    } catch {
        return enc;
    }
}

function bufferFromDbImageField(raw) {
    if (raw === undefined || raw === null) return null;
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof Uint8Array) return Buffer.from(raw);
    if (Array.isArray(raw)) return Buffer.from(raw);
    if (typeof raw === 'object' && raw.type === 'Buffer' && Array.isArray(raw.data)) {
        return Buffer.from(raw.data);
    }
    try {
        return Buffer.from(raw);
    } catch {
        return null;
    }
}

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

function scheduleCommunityEvaluation(guildId, userId) {
    setImmediate(() => {
        require('./community-challenges-achievements').evaluateUser(guildId, userId).catch(() => null);
    });
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

function sanitizeCatalogImageUrl(raw) {
    const u = String(raw || '').trim().slice(0, 2048);
    if (!u) return '';
    if (/^https?:\/\/.+/i.test(u)) return u;
    return '';
}

function normalizeCharacterRecord(item = {}) {
    const id = String(item.id || `ch_${Date.now()}`);
    const name = String(item.name || 'Unknown');
    const series = String(item.series || 'Original');
    const rarity = ['SSR', 'SR', 'R', 'N'].includes(String(item.rarity || 'N').toUpperCase()) ? String(item.rarity).toUpperCase() : 'N';
    const description = String(item.description || '').trim() || buildDefaultCharacterDescription({ name, series, rarity });
    const imageUrl = sanitizeCatalogImageUrl(item.imageUrl);

    return {
        id,
        name,
        series,
        rarity,
        description,
        baseValue: Math.max(1, Number.parseInt(`${item.baseValue || 10}`, 10) || 10),
        ...(imageUrl ? { imageUrl } : {})
    };
}

function applyCatalogOverride(character = {}, override = {}) {
    if (!override || typeof override !== 'object') return normalizeCharacterRecord(character);
    const {
        shopHidden: _sh,
        shopPrice: _sp,
        removedFromGuildCatalog: _rm,
        updatedAt: _ua,
        updatedBy: _ub,
        ...rest
    } = override;
    return normalizeCharacterRecord({
        ...character,
        ...rest,
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
    if (raw.imageUrl !== undefined) {
        const img = sanitizeCatalogImageUrl(raw.imageUrl);
        patch.imageUrl = img;
        patch._explicitImageClear = img === '';
    }
    if (raw.clearCatalogImage === true) {
        patch.imageUrl = '';
        patch._explicitImageClear = true;
    }
    if (raw.shopHidden !== undefined) patch.shopHidden = raw.shopHidden === true;
    const rawPrice = raw.shopPrice;
    const priceStr = rawPrice === undefined || rawPrice === null ? undefined : String(rawPrice).trim();
    if (raw.clearShopPrice === true || priceStr === '') {
        patch._explicitShopPriceClear = true;
    } else if (priceStr !== undefined) {
        const n = Number.parseInt(priceStr, 10);
        if (Number.isFinite(n) && n >= 1) {
            patch.shopPrice = Math.min(1_000_000_000, n);
        }
    }
    if (raw.removedFromGuildCatalog === true) patch.removedFromGuildCatalog = true;
    if (raw.restoreToGuildCatalog === true) patch._explicitGuildCatalogRestore = true;
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
        minigameRpsReward: 10,
        minigameDoorsReward: 12,
        minigameColorReward: 9,
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
        minigameRpsReward: Math.max(0, Math.min(1000, Number.parseInt(`${raw.minigameRpsReward ?? 10}`, 10) || 0)),
        minigameDoorsReward: Math.max(0, Math.min(1000, Number.parseInt(`${raw.minigameDoorsReward ?? 12}`, 10) || 0)),
        minigameColorReward: Math.max(0, Math.min(1000, Number.parseInt(`${raw.minigameColorReward ?? 9}`, 10) || 0)),
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
    const imageUrl = sanitizeCatalogImageUrl(raw.imageUrl);

    return {
        uid: String(raw.uid || `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
        characterId: String(raw.characterId || ''),
        name,
        series,
        rarity,
        description,
        value: Math.max(1, Number.parseInt(`${raw.value || 10}`, 10) || 10),
        obtainedAt: Number.parseInt(`${raw.obtainedAt || Date.now()}`, 10) || Date.now(),
        ...(imageUrl ? { imageUrl } : {})
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
    const imageUrl = sanitizeCatalogImageUrl(character.imageUrl);
    return normalizeInventoryItem({
        uid: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        characterId: character.id,
        name: character.name,
        series: character.series,
        rarity: character.rarity,
        description: character.description,
        value: variance,
        obtainedAt: Date.now(),
        ...(imageUrl ? { imageUrl } : {})
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
    scheduleCommunityEvaluation(guildId, userId);
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

function resolveShopPrice(character = {}, config = {}, overrideEntry = null) {
    if (overrideEntry && typeof overrideEntry === 'object' && overrideEntry.shopPrice != null) {
        const n = Number.parseInt(`${overrideEntry.shopPrice}`, 10);
        if (Number.isFinite(n) && n >= 1) {
            return Math.min(1_000_000_000, n);
        }
    }
    return getShopPrice(character, config);
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
    return base
        .filter((character) => overrides[character.id]?.removedFromGuildCatalog !== true)
        .map((character) => applyCatalogOverride(character, overrides[character.id]));
}

async function getShopCatalog(guildId, config = {}) {
    const overrides = await getGuildCatalogOverrides(guildId);
    const pool = await getGuildCharacterPool(guildId);
    return pool
        .filter((character) => !overrides[character.id]?.shopHidden)
        .map((character) => {
            const entry = overrides[character.id];
            return {
                ...character,
                price: resolveShopPrice(character, config, entry)
            };
        })
        .sort((left, right) => right.price - left.price);
}

/** Catálogo completo para el panel web (incluye ocultos y eliminados del servidor). */
async function listShopCatalogForAdmin(guildId, config = {}) {
    const overrides = await getGuildCatalogOverrides(guildId);
    const base = getCharacterPool();
    const rows = base.map((character) => {
        const entry = overrides[character.id];
        const catalogRemoved = entry?.removedFromGuildCatalog === true;
        const merged = applyCatalogOverride(character, entry || {});
        const price = resolveShopPrice(merged, config, entry || {});
        const custom = entry?.shopPrice;
        const customNum = Number.parseInt(`${custom}`, 10);
        const hasCustomPrice = Number.isFinite(customNum) && customNum >= 1;
        const shopPriceDefault = getShopPrice(merged, config);
        return {
            ...merged,
            price,
            shopPriceDefault,
            shopHidden: !!entry?.shopHidden,
            catalogRemoved,
            ...(hasCustomPrice ? { shopPriceOverride: Math.min(1_000_000_000, customNum) } : {})
        };
    });
    rows.sort((left, right) => {
        const lr = left.catalogRemoved === true ? 1 : 0;
        const rr = right.catalogRemoved === true ? 1 : 0;
        if (lr !== rr) return lr - rr;
        return (right.price || 0) - (left.price || 0);
    });
    return rows;
}

async function pruneHiddenSystemListings(guildId) {
    const overrides = await getGuildCatalogOverrides(guildId);
    const blockedIds = new Set(Object.entries(overrides)
        .filter(([, entry]) => entry && (
            entry.shopHidden === true
            || entry.removedFromGuildCatalog === true
        ))
        .map(([id]) => id));
    if (!blockedIds.size) return false;

    const market = await getGuildMarket(guildId);
    let changed = false;
    const next = market.filter((row) => {
        if (row.sellerId !== SYSTEM_MARKET_SELLER_ID) return true;
        const cid = String(row.item?.characterId || '');
        if (cid && blockedIds.has(cid)) {
            changed = true;
            return false;
        }
        return true;
    });
    if (changed) await setGuildMarket(guildId, next);
    return changed;
}

function buildCatalogMarketItem(character = {}) {
    const imageUrl = sanitizeCatalogImageUrl(character.imageUrl);
    return normalizeInventoryItem({
        uid: `seed_${character.id}`,
        characterId: character.id,
        name: character.name,
        series: character.series,
        rarity: character.rarity,
        description: character.description,
        value: character.baseValue,
        obtainedAt: Date.now(),
        ...(imageUrl ? { imageUrl } : {})
    });
}

/** Imagen PNG/JPEG/WebP/GIF del catálogo de tienda (MySQL LONGBLOB), independiente del host del panel */
function sanitizeShopImageMime(mime = '') {
    const m = String(mime || '').split(';')[0].trim().toLowerCase();
    if (['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(m)) {
        return m === 'image/jpg' ? 'image/jpeg' : m;
    }
    return 'application/octet-stream';
}

function shopCatalogMimeToExt(mime = '') {
    const m = String(mime || '').split(';')[0].trim().toLowerCase();
    if (m.includes('png')) return 'png';
    if (m.includes('webp')) return 'webp';
    if (m.includes('gif')) return 'gif';
    if (m.includes('jpeg') || m === 'image/jpg') return 'jpg';
    return 'png';
}

async function deleteGuildCatalogShopImageBlob(guildId, characterId) {
    const gid = String(guildId || '').trim().slice(0, 32);
    const cid = String(characterId || '').trim().slice(0, 128);
    if (!gid || !cid) return false;
    deleteGuildCatalogShopDiskImage(guildId, characterId);
    try {
        await db.query(
            'DELETE FROM gacha_catalog_shop_image WHERE guild_id = ? AND character_id = ?',
            [gid, cid]
        );
        return true;
    } catch {
        return false;
    }
}

async function listGuildCatalogShopBlobIds(guildId) {
    const gid = String(guildId || '').trim().slice(0, 32);
    if (!gid) return new Set();
    try {
        const rows = await db.query(
            'SELECT character_id FROM gacha_catalog_shop_image WHERE guild_id = ?',
            [gid]
        );
        return new Set((rows || []).map((r) => String(r.character_id || '')).filter(Boolean));
    } catch {
        return new Set();
    }
}

async function getGuildCatalogShopImageBlob(guildId, characterId) {
    const gid = String(guildId || '').trim().slice(0, 32);
    const cid = String(characterId || '').trim().slice(0, 128);
    if (!gid || !cid) return null;
    try {
        const rows = await db.query(
            'SELECT mime_type AS mime, image AS data FROM gacha_catalog_shop_image WHERE guild_id = ? AND character_id = ? LIMIT 1',
            [gid, cid]
        );
        const row = rows && rows[0];
        if (!row || row.data === undefined || row.data === null) return null;
        const buf = bufferFromDbImageField(row.data);
        if (!buf?.length || buf.length > MAX_SHOP_CATALOG_IMAGE_BYTES) return null;
        return { mime: String(row.mime || 'image/png'), data: buf };
    } catch {
        return null;
    }
}

function readGuildCatalogShopDiskImage(guildId, characterId) {
    const gid = String(guildId || '').trim();
    const cid = String(characterId || '').trim();
    if (!gid || !cid) return null;
    ensureShopCatalogUploadDir();
    for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif']) {
        const abs = shopCatalogDiskFilePath(gid, cid, ext);
        try {
            if (!fs.existsSync(abs)) continue;
            const buf = fs.readFileSync(abs);
            if (!buf.length || buf.length > MAX_SHOP_CATALOG_IMAGE_BYTES) continue;
            const mime = ext === 'png' ? 'image/png'
                : (ext === 'webp' ? 'image/webp' : (ext === 'gif' ? 'image/gif' : 'image/jpeg'));
            return {
                mime,
                data: buf,
                diskPath: `/uploads/gacha-catalog/${path.basename(abs)}`
            };
        } catch {
            continue;
        }
    }
    return null;
}

function writeGuildCatalogShopDiskImage(guildId, characterId, buffer, mimeType = '') {
    if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
    const ext = shopCatalogMimeToExt(mimeType);
    const target = shopCatalogDiskFilePath(guildId, characterId, ext);
    try {
        ensureShopCatalogUploadDir();
        const dir = path.dirname(target);
        const fileStem = path.basename(target, `.${ext}`);
        for (const f of fs.readdirSync(dir)) {
            if (f.startsWith(`${fileStem}.`)) {
                try { fs.unlinkSync(path.join(dir, f)); } catch { /* noop */ }
            }
        }
        fs.writeFileSync(target, buffer);
        return `/uploads/gacha-catalog/${path.basename(target)}`;
    } catch (e) {
        console.warn('⚠️ No se pudo escribir imagen de tienda en disco:', e?.message || e);
        return null;
    }
}

async function listGuildCatalogShopImageIds(guildId) {
    const ids = await listGuildCatalogShopBlobIds(guildId);
    const gid = String(guildId || '').trim();
    if (!gid) return ids;
    const prefix = shopCatalogDiskPrefix(gid);
    try {
        ensureShopCatalogUploadDir();
        for (const f of fs.readdirSync(SHOP_CATALOG_UPLOAD_DIR)) {
            if (!f.startsWith(prefix)) continue;
            const cid = characterIdFromShopDiskFile(gid, f);
            if (cid) ids.add(cid);
        }
    } catch {
        /* noop */
    }
    return ids;
}

function deleteGuildCatalogShopDiskImage(guildId, characterId) {
    let removed = false;
    for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif']) {
        const abs = shopCatalogDiskFilePath(guildId, characterId, ext);
        try {
            if (fs.existsSync(abs)) {
                fs.unlinkSync(abs);
                removed = true;
            }
        } catch {
            /* noop */
        }
    }
    return removed;
}

/** MySQL primero; si falla, copia en web/uploads/gacha-catalog */
async function resolveGuildCatalogShopImage(guildId, characterId) {
    const blob = await getGuildCatalogShopImageBlob(guildId, characterId);
    if (blob?.data?.length) return blob;
    return readGuildCatalogShopDiskImage(guildId, characterId);
}

async function guildHasCatalogShopImage(guildId, characterId) {
    const img = await resolveGuildCatalogShopImage(guildId, characterId);
    return !!(img?.data?.length);
}

async function setGuildCatalogShopImageBlob(guildId, characterId, buffer, mimeType = '') {
    const gid = String(guildId || '').trim().slice(0, 32);
    const cid = String(characterId || '').trim().slice(0, 128);
    if (!gid || !cid || !Buffer.isBuffer(buffer) || buffer.length === 0) return false;
    if (buffer.length > MAX_SHOP_CATALOG_IMAGE_BYTES) return false;
    const mime = sanitizeShopImageMime(mimeType);
    try {
        await db.query(
            `INSERT INTO gacha_catalog_shop_image (guild_id, character_id, mime_type, image)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE mime_type = VALUES(mime_type), image = VALUES(image)`,
            [gid, cid, mime, buffer]
        );
        return true;
    } catch (e) {
        console.warn('⚠️ No se pudo guardar imagen de tienda en MySQL:', e.message);
        return false;
    }
}

async function setGuildCatalogItem(guildId, characterId = '', rawPatch = {}, updatedBy = 'system') {
    const base = getCharacterPool().find((item) => item.id === String(characterId || ''));
    if (!base) return { ok: false, reason: 'item_not_found' };

    const patch = normalizeCatalogOverride(rawPatch, base);
    const explicitImageClear = patch._explicitImageClear === true;
    const explicitShopPriceClear = patch._explicitShopPriceClear === true;
    const explicitGuildCatalogRestore = patch._explicitGuildCatalogRestore === true;
    delete patch._explicitImageClear;
    delete patch._explicitShopPriceClear;
    delete patch._explicitGuildCatalogRestore;
    const hasMutation = Object.keys(patch).length > 0 || explicitImageClear || explicitShopPriceClear || explicitGuildCatalogRestore;
    if (!hasMutation) return { ok: false, reason: 'empty_patch' };

    const overrides = await getGuildCatalogOverrides(guildId);
    const prev = { ...(overrides[base.id] || {}) };
    const merged = { ...prev, ...patch };

    if (explicitImageClear || ('imageUrl' in patch && patch.imageUrl === '')) {
        delete merged.imageUrl;
    }
    if (explicitShopPriceClear) {
        delete merged.shopPrice;
    }
    if (explicitGuildCatalogRestore) {
        delete merged.removedFromGuildCatalog;
    }

    merged.updatedAt = new Date().toISOString();
    merged.updatedBy = String(updatedBy || 'system');
    overrides[base.id] = merged;
    await setGuildCatalogOverrides(guildId, overrides);
    await pruneHiddenSystemListings(guildId);

    if (rawPatch.clearCatalogImage === true) {
        await deleteGuildCatalogShopImageBlob(guildId, base.id);
    } else if (rawPatch.imageUrl !== undefined) {
        const remote = sanitizeCatalogImageUrl(patch.imageUrl);
        if (remote && /^https?:\/\//i.test(remote)) {
            await deleteGuildCatalogShopImageBlob(guildId, base.id);
        }
    }

    return {
        ok: true,
        item: applyCatalogOverride(base, merged)
    };
}

async function deleteGuildCatalogItem(guildId, characterId = '', updatedBy = 'system') {
    const id = String(characterId || '').trim();
    if (!id) return { ok: false, reason: 'invalid_id' };

    const overrides = await getGuildCatalogOverrides(guildId);
    if (!overrides[id]) return { ok: false, reason: 'no_override' };

    delete overrides[id];
    await setGuildCatalogOverrides(guildId, overrides);
    await deleteGuildCatalogShopImageBlob(guildId, id);
    await pruneHiddenSystemListings(guildId);

    const base = getCharacterPool().find((item) => item.id === id);
    return {
        ok: true,
        item: base ? normalizeCharacterRecord(base) : null,
        clearedBy: String(updatedBy || 'system')
    };
}

async function ensureGuildEconomyContent(guildId) {
    const config = await getConfig(guildId);
    const catalog = await getShopCatalog(guildId, config);
    const market = await getGuildMarket(guildId);

    if (!catalog.length) {
        let changed = false;
        const next = market.filter((row) => {
            if (row.sellerId !== SYSTEM_MARKET_SELLER_ID) return true;
            changed = true;
            return false;
        });
        if (changed) await setGuildMarket(guildId, next);
        return;
    }

    const byCharacterId = new Map(catalog.map((character) => [character.id, character]));
    let marketChanged = false;

    for (let i = market.length - 1; i >= 0; i -= 1) {
        const row = market[i];
        if (row.sellerId !== SYSTEM_MARKET_SELLER_ID) continue;
        const cid = String(row.item?.characterId || '');
        const character = cid ? byCharacterId.get(cid) : null;
        if (!character) {
            market.splice(i, 1);
            marketChanged = true;
            continue;
        }
        const nextItem = buildCatalogMarketItem(character);
        const current = normalizeInventoryItem(row.item || {});
        const nextImg = sanitizeCatalogImageUrl(nextItem.imageUrl);
        const curImg = sanitizeCatalogImageUrl(current.imageUrl);
        if (current.name !== nextItem.name
            || current.series !== nextItem.series
            || current.rarity !== nextItem.rarity
            || current.description !== nextItem.description
            || curImg !== nextImg) {
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

function parseStoredProfile(value, userId) {
    if (value && typeof value === 'object') return normalizeProfile(value, userId);
    try {
        return normalizeProfile(JSON.parse(String(value || '{}')), userId);
    } catch {
        return normalizeProfile(defaultProfile(userId), userId);
    }
}

async function addCoinsInTransaction(tx, guildId, userId, delta, options = {}) {
    const key = `gacha_profile_${guildId}_${userId}`;
    const seed = normalizeProfile(defaultProfile(userId), userId);
    await tx.query(
        'INSERT IGNORE INTO key_value_store (`key`, `value`) VALUES (?, ?)',
        [key, JSON.stringify(seed)]
    );
    const profileRows = await tx.query(
        'SELECT `value` FROM key_value_store WHERE `key` = ? FOR UPDATE',
        [key]
    );
    const profile = parseStoredProfile(profileRows[0]?.value, userId);
    const idempotencyKey = String(
        options.idempotencyKey || `legacy:${Date.now()}:${Math.random().toString(36).slice(2)}`
    ).slice(0, 191);
    const existing = await tx.query(
        `SELECT balance_after FROM community_reward_ledger
         WHERE guild_id = ? AND user_id = ? AND idempotency_key = ? LIMIT 1`,
        [String(guildId), String(userId), idempotencyKey]
    );
    if (existing[0]) {
        return { profile, applied: false };
    }

    profile.coins = Math.max(0, (Number(profile.coins) || 0) + delta);
    profile.updatedAt = new Date().toISOString();
    await tx.query(
        'UPDATE key_value_store SET `value` = ? WHERE `key` = ?',
        [JSON.stringify(profile), key]
    );
    await tx.query(
        `INSERT INTO community_reward_ledger
            (guild_id, user_id, idempotency_key, source_type, source_id, amount, balance_after, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            String(guildId), String(userId), idempotencyKey,
            String(options.sourceType || 'legacy').slice(0, 48),
            options.sourceId ? String(options.sourceId).slice(0, 191) : null,
            delta, profile.coins, new Date()
        ]
    );
    return { profile, applied: true };
}

async function addCoins(guildId, userId, amount = 0, options = {}) {
    const delta = Math.max(0, Number.parseInt(`${amount || 0}`, 10) || 0);
    if (!delta) return getProfile(guildId, userId);

    const run = (tx) => addCoinsInTransaction(tx, guildId, userId, delta, options);
    if (options.transaction) {
        const result = await run(options.transaction);
        return options.returnMeta ? result : result.profile;
    }
    const result = await db.transaction(run);
    cache.delete(`gacha_profile_${guildId}_${userId}`);
    return options.returnMeta ? result : result.profile;
}

function invalidateProfileCache(guildId, userId) {
    cache.delete(`gacha_profile_${guildId}_${userId}`);
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

    const overrides = await getGuildCatalogOverrides(guildId);
    const pool = await getGuildCharacterPool(guildId);
    const character = pool.find((item) => item.id === String(characterId || ''));
    if (!character) return { ok: false, reason: 'item_not_found' };
    if (overrides[character.id]?.shopHidden) return { ok: false, reason: 'item_not_found' };

    const price = resolveShopPrice(character, config, overrides[character.id]);
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
    listShopCatalogForAdmin,
    setGuildCatalogItem,
    deleteGuildCatalogItem,
    ensureGuildEconomyContent,
    addCoins,
    addCoinsInTransaction,
    invalidateProfileCache,
    trySpendCoins,
    purchaseShopCharacter,
    getGuildCatalogShopImageBlob,
    resolveGuildCatalogShopImage,
    guildHasCatalogShopImage,
    setGuildCatalogShopImageBlob,
    writeGuildCatalogShopDiskImage,
    deleteGuildCatalogShopImageBlob,
    listGuildCatalogShopBlobIds,
    listGuildCatalogShopImageIds,
    shopCatalogMimeToExt
};
