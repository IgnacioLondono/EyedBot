const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'music-configs.json');
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

function defaultConfig() {
    return {
        djRoleIds: [],
        allowRequesterControl: true,
        updatedAt: new Date().toISOString(),
        updatedBy: 'system'
    };
}

function sanitizeConfig(config) {
    const cfg = config && typeof config === 'object' ? { ...config } : {};
    cfg.djRoleIds = Array.isArray(cfg.djRoleIds) ? cfg.djRoleIds.filter(Boolean).map(String) : [];
    cfg.allowRequesterControl = cfg.allowRequesterControl !== false;
    cfg.updatedAt = cfg.updatedAt || new Date().toISOString();
    cfg.updatedBy = cfg.updatedBy || 'system';
    return cfg;
}

async function getMusicConfig(guildId) {
    const cacheKey = `music_cfg_${guildId}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(`music_config_${guildId}`);
        if (fromDb && typeof fromDb === 'object') {
            const cfg = sanitizeConfig(fromDb);
            cacheSet(cacheKey, cfg);
            return cfg;
        }
    } catch {
        // fallback to file
    }

    const store = readStore();
    const cfg = sanitizeConfig(store.guilds[guildId]?.config || defaultConfig());
    cacheSet(cacheKey, cfg);
    return cfg;
}

async function setMusicConfig(guildId, config) {
    const cfg = sanitizeConfig(config);
    try {
        await db.set(`music_config_${guildId}`, cfg);
    } catch {
        // fallback to file
    }

    const store = readStore();
    if (!store.guilds[guildId]) store.guilds[guildId] = { config: null };
    store.guilds[guildId].config = cfg;
    writeStore(store);
    cacheSet(`music_cfg_${guildId}`, cfg);
    return cfg;
}

module.exports = {
    defaultConfig,
    getMusicConfig,
    setMusicConfig
};

