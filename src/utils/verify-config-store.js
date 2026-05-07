const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'verify-configs.json');
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

function ensureGuildBucket(store, guildId) {
    if (!store.guilds[guildId]) {
        store.guilds[guildId] = { verifyConfig: null };
    }
    return store.guilds[guildId];
}

async function getVerifyConfig(guildId) {
    const cacheKey = `verifyConfig_${guildId}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(`verify_config_${guildId}`);
        if (fromDb && typeof fromDb === 'object') {
            cacheSet(cacheKey, fromDb);
            return fromDb;
        }
    } catch {
        // fallback to local file
    }

    const store = readStore();
    const fallback = store.guilds[guildId]?.verifyConfig || null;
    cacheSet(cacheKey, fallback);
    return fallback;
}

async function setVerifyConfig(guildId, config) {
    try {
        await db.set(`verify_config_${guildId}`, config);
    } catch {
        // still persist on local file
    }

    const store = readStore();
    const bucket = ensureGuildBucket(store, guildId);
    bucket.verifyConfig = config;
    writeStore(store);
    cacheSet(`verifyConfig_${guildId}`, config || null);
    return true;
}

module.exports = {
    getVerifyConfig,
    setVerifyConfig
};
