const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'counting-configs.json');
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
    cache.set(key, {
        value,
        expiresAt: Date.now() + CACHE_TTL_MS
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

function normalizeConfig(raw) {
    const current = Math.max(0, Number.parseInt(raw?.current || 0, 10) || 0);
    return {
        enabled: raw?.enabled === true,
        channelId: raw?.channelId ? String(raw.channelId) : null,
        current,
        lastUserId: raw?.lastUserId ? String(raw.lastUserId) : null,
        updatedAt: raw?.updatedAt || null
    };
}

function ensureGuildBucket(store, guildId) {
    const normalized = normalizeConfig(store.guilds[guildId] || {});
    store.guilds[guildId] = normalized;
    return store.guilds[guildId];
}

function nowIso() {
    return new Date().toISOString();
}

async function getGuildConfig(guildId) {
    const cacheKey = `counting_${guildId}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(`counting_${guildId}`);
        if (fromDb && typeof fromDb === 'object') {
            const normalized = normalizeConfig(fromDb);
            cacheSet(cacheKey, normalized);
            return normalized;
        }
    } catch {
        // ignore and fallback to file
    }

    const store = readStore();
    const fallback = ensureGuildBucket(store, guildId);
    cacheSet(cacheKey, fallback);
    return fallback;
}

async function setGuildConfig(guildId, nextConfig) {
    const normalized = normalizeConfig({
        ...nextConfig,
        updatedAt: nowIso()
    });

    try {
        await db.set(`counting_${guildId}`, normalized);
    } catch {
        // ignore db failure and persist locally
    }

    const store = readStore();
    store.guilds[guildId] = normalized;
    writeStore(store);
    cacheSet(`counting_${guildId}`, normalized);
    return normalized;
}

async function setChannel(guildId, channelId) {
    const current = await getGuildConfig(guildId);
    return setGuildConfig(guildId, {
        ...current,
        enabled: true,
        channelId,
        current: current.current || 0
    });
}

async function disable(guildId) {
    const current = await getGuildConfig(guildId);
    return setGuildConfig(guildId, {
        ...current,
        enabled: false,
        channelId: null
    });
}

async function resetProgress(guildId) {
    const current = await getGuildConfig(guildId);
    return setGuildConfig(guildId, {
        ...current,
        current: 0,
        lastUserId: null
    });
}

async function setProgress(guildId, progress) {
    const current = await getGuildConfig(guildId);
    return setGuildConfig(guildId, {
        ...current,
        current: Math.max(0, Number.parseInt(progress?.current || 0, 10) || 0),
        lastUserId: progress?.lastUserId ? String(progress.lastUserId) : null
    });
}

module.exports = {
    getGuildConfig,
    setGuildConfig,
    setChannel,
    disable,
    resetProgress,
    setProgress
};
