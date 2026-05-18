const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'confession-configs.json');
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
    return {
        channelId: raw?.channelId ? String(raw.channelId) : null,
        nextId: Math.max(1, Number.parseInt(raw?.nextId, 10) || 1)
    };
}

function ensureGuildBucket(store, guildId) {
    const normalized = normalizeConfig(store.guilds[guildId] || {});
    store.guilds[guildId] = normalized;
    return store.guilds[guildId];
}

async function getGuildConfig(guildId) {
    const cacheKey = `confession_${guildId}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(`confession_${guildId}`);
        if (fromDb && typeof fromDb === 'object') {
            const normalized = normalizeConfig(fromDb);
            cacheSet(cacheKey, normalized);
            return normalized;
        }
    } catch {
        // ignore db failures and fallback to file
    }

    const store = readStore();
    const fallback = normalizeConfig(store.guilds[guildId] || {});
    cacheSet(cacheKey, fallback);
    return fallback;
}

async function persistGuildConfig(guildId, config) {
    const normalized = normalizeConfig(config);

    try {
        await db.set(`confession_${guildId}`, normalized);
    } catch {
        // ignore db failures and still persist locally
    }

    const store = readStore();
    ensureGuildBucket(store, guildId);
    store.guilds[guildId] = normalized;
    writeStore(store);
    cacheSet(`confession_${guildId}`, normalized);
    return normalized;
}

async function setChannelId(guildId, channelId) {
    const current = await getGuildConfig(guildId);
    return persistGuildConfig(guildId, {
        ...current,
        channelId: channelId ? String(channelId) : null
    });
}

async function clearChannel(guildId) {
    const current = await getGuildConfig(guildId);
    return persistGuildConfig(guildId, {
        ...current,
        channelId: null
    });
}

async function takeNextConfessionId(guildId) {
    const current = await getGuildConfig(guildId);
    const id = current.nextId;
    await persistGuildConfig(guildId, {
        ...current,
        nextId: id + 1
    });
    return id;
}

module.exports = {
    getGuildConfig,
    setChannelId,
    clearChannel,
    takeNextConfessionId
};
