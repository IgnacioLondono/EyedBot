const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'free-games-configs.json');
const CACHE_TTL_MS = Math.max(1000, Number.parseInt(process.env.CONFIG_CACHE_TTL_MS || '120000', 10));
const cache = new Map();

function cacheGet(key) {
    const item = cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
        cache.delete(key);
        return null;
    }
    return item.value;
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
        enabled: false,
        channelId: '',
        mentionText: '',
        sources: {
            epic: true,
            steam: true
        },
        minDiscount: 100,
        color: '4ccb81',
        footerText: 'EyedBot · Juegos gratis',
        notifiedIds: [],
        updatedAt: new Date().toISOString(),
        updatedBy: 'system'
    };
}

function normalizeConfig(raw = {}) {
    const base = defaultConfig();
    const sources = raw.sources && typeof raw.sources === 'object' ? raw.sources : {};
    return {
        enabled: raw.enabled === true,
        channelId: String(raw.channelId || '').trim(),
        mentionText: String(raw.mentionText || '').slice(0, 300),
        sources: {
            epic: sources.epic !== false,
            steam: sources.steam !== false
        },
        minDiscount: Math.max(0, Math.min(100, Number.parseInt(raw.minDiscount ?? base.minDiscount, 10) || base.minDiscount)),
        color: String(raw.color || base.color).replace('#', '').slice(0, 6) || base.color,
        footerText: String(raw.footerText || base.footerText).slice(0, 200),
        notifiedIds: Array.isArray(raw.notifiedIds)
            ? raw.notifiedIds.map((x) => String(x)).filter(Boolean).slice(-400)
            : [],
        updatedAt: raw.updatedAt || new Date().toISOString(),
        updatedBy: String(raw.updatedBy || 'system')
    };
}

async function getFreeGamesConfig(guildId) {
    const cacheKey = `free_games_cfg_${guildId}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(`free_games_config_${guildId}`);
        if (fromDb && typeof fromDb === 'object') {
            const normalized = normalizeConfig(fromDb);
            cacheSet(cacheKey, normalized);
            return normalized;
        }
    } catch {
        // fallback file
    }

    const store = readStore();
    const cfg = normalizeConfig(store.guilds[guildId] || defaultConfig());
    cacheSet(cacheKey, cfg);
    return cfg;
}

async function setFreeGamesConfig(guildId, config) {
    const normalized = normalizeConfig(config);

    try {
        await db.set(`free_games_config_${guildId}`, normalized);
    } catch {
        // fallback file
    }

    const store = readStore();
    store.guilds[guildId] = normalized;
    writeStore(store);
    cacheSet(`free_games_cfg_${guildId}`, normalized);
    return normalized;
}

async function listAllFreeGamesConfigs() {
    const merged = new Map();

    try {
        const rows = await db.query(
            'SELECT `key`, `value` FROM key_value_store WHERE `key` LIKE ?',
            ['free_games_config_%']
        );
        for (const row of rows || []) {
            const key = String(row.key || '');
            const guildId = key.replace(/^free_games_config_/, '');
            if (!guildId) continue;
            let parsed = null;
            try {
                parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
            } catch {
                parsed = null;
            }
            if (parsed && typeof parsed === 'object') {
                merged.set(guildId, { guildId, config: normalizeConfig(parsed) });
            }
        }
    } catch {
        // fallback file-only
    }

    const store = readStore();
    for (const [guildId, raw] of Object.entries(store.guilds || {})) {
        if (!merged.has(guildId)) {
            merged.set(guildId, { guildId, config: normalizeConfig(raw || {}) });
        }
    }
    return Array.from(merged.values());
}

module.exports = {
    defaultConfig,
    normalizeConfig,
    getFreeGamesConfig,
    setFreeGamesConfig,
    listAllFreeGamesConfigs
};
