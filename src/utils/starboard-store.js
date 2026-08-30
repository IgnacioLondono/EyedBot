const fs = require('fs');
const path = require('path');
const db = require('./database');
const { scopeKey } = require('./config-scope');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'starboard-configs.json');
const CACHE_TTL_MS = Math.max(1000, Number.parseInt(process.env.CONFIG_CACHE_TTL_MS || '60000', 10));
const cache = new Map();

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
        const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8') || '{}');
        if (!parsed.guilds || typeof parsed.guilds !== 'object') return { guilds: {} };
        return parsed;
    } catch {
        return { guilds: {} };
    }
}

function writeStore(data) {
    ensureStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function defaultConfig() {
    return {
        enabled: false,
        channelId: '',
        emoji: '⭐',
        threshold: 3,
        ignoredChannelIds: [],
        updatedAt: new Date().toISOString()
    };
}

async function getConfig(guildId) {
    guildId = scopeKey(guildId);
    const cacheKey = `starboard_cfg_${guildId}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache) return fromCache;

    try {
        const fromDb = await db.get(`starboard_config_${guildId}`);
        if (fromDb && typeof fromDb === 'object') {
            cacheSet(cacheKey, fromDb);
            return fromDb;
        }
    } catch {
        // fallback
    }

    const store = readStore();
    const cfg = store.guilds[guildId]?.config || defaultConfig();
    cacheSet(cacheKey, cfg);
    return cfg;
}

async function setConfig(guildId, config) {
    guildId = scopeKey(guildId);
    const next = { ...defaultConfig(), ...config, updatedAt: new Date().toISOString() };
    try {
        await db.set(`starboard_config_${guildId}`, next);
    } catch {
        // fallback
    }
    const store = readStore();
    if (!store.guilds[guildId]) store.guilds[guildId] = {};
    store.guilds[guildId].config = next;
    writeStore(store);
    cacheSet(`starboard_cfg_${guildId}`, next);
    return next;
}

async function getEntryMap(guildId) {
    guildId = scopeKey(guildId);
    try {
        const map = await db.get(`starboard_map_${guildId}`);
        if (map && typeof map === 'object') return map;
    } catch {
        // fallback
    }
    const store = readStore();
    return store.guilds[guildId]?.entries || {};
}

async function setEntry(guildId, sourceMessageId, entry) {
    guildId = scopeKey(guildId);
    const map = await getEntryMap(guildId);
    map[String(sourceMessageId)] = entry;
    try {
        await db.set(`starboard_map_${guildId}`, map);
    } catch {
        // fallback
    }
    const store = readStore();
    if (!store.guilds[guildId]) store.guilds[guildId] = {};
    store.guilds[guildId].entries = map;
    writeStore(store);
}

module.exports = {
    defaultConfig,
    getConfig,
    setConfig,
    getEntryMap,
    setEntry
};
