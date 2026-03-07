const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'leveling-store.json');
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
        store.guilds[guildId] = {
            config: null,
            users: {}
        };
    }
    if (!store.guilds[guildId].users || typeof store.guilds[guildId].users !== 'object') {
        store.guilds[guildId].users = {};
    }
    return store.guilds[guildId];
}

function defaultConfig() {
    return {
        enabled: false,
        messageXpEnabled: true,
        voiceXpEnabled: true,
        messageCooldownMs: 45000,
        messageXpMin: 10,
        messageXpMax: 16,
        voiceXpPerMinute: 6,
        voiceRequirePeers: true,
        difficulty: {
            baseXp: 280,
            exponent: 2.08
        },
        roleRewards: [],
        updatedAt: new Date().toISOString(),
        updatedBy: 'system'
    };
}

function normalizeUserState(raw = {}) {
    return {
        xp: Math.max(0, Number.parseInt(raw.xp || 0, 10) || 0),
        level: Math.max(0, Number.parseInt(raw.level || 0, 10) || 0),
        messageCount: Math.max(0, Number.parseInt(raw.messageCount || 0, 10) || 0),
        voiceMinutes: Math.max(0, Number.parseInt(raw.voiceMinutes || 0, 10) || 0),
        updatedAt: raw.updatedAt || new Date().toISOString()
    };
}

async function getLevelingConfig(guildId) {
    const cacheKey = `leveling_cfg_${guildId}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(`leveling_config_${guildId}`);
        if (fromDb && typeof fromDb === 'object') {
            cacheSet(cacheKey, fromDb);
            return fromDb;
        }
    } catch {
        // fallback to local store
    }

    const store = readStore();
    const cfg = store.guilds[guildId]?.config || defaultConfig();
    cacheSet(cacheKey, cfg);
    return cfg;
}

async function setLevelingConfig(guildId, config) {
    try {
        await db.set(`leveling_config_${guildId}`, config);
    } catch {
        // fallback still persists local
    }

    const store = readStore();
    const bucket = ensureGuildBucket(store, guildId);
    bucket.config = config;
    writeStore(store);
    cacheSet(`leveling_cfg_${guildId}`, config);
    return true;
}

async function getUserState(guildId, userId) {
    const cacheKey = `leveling_user_${guildId}_${userId}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(`leveling_user_${guildId}_${userId}`);
        if (fromDb && typeof fromDb === 'object') {
            const normalized = normalizeUserState(fromDb);
            cacheSet(cacheKey, normalized);
            return normalized;
        }
    } catch {
        // fallback to local store
    }

    const store = readStore();
    const fromFile = store.guilds[guildId]?.users?.[userId] || normalizeUserState();
    const normalized = normalizeUserState(fromFile);
    cacheSet(cacheKey, normalized);
    return normalized;
}

async function setUserState(guildId, userId, userState) {
    const normalized = normalizeUserState(userState);

    try {
        await db.set(`leveling_user_${guildId}_${userId}`, normalized);
    } catch {
        // fallback still persists local
    }

    const store = readStore();
    const bucket = ensureGuildBucket(store, guildId);
    bucket.users[userId] = normalized;
    writeStore(store);
    cacheSet(`leveling_user_${guildId}_${userId}`, normalized);
    return normalized;
}

async function listGuildUsers(guildId) {
    const store = readStore();
    const users = store.guilds[guildId]?.users || {};
    return Object.entries(users).map(([userId, state]) => ({
        userId,
        ...normalizeUserState(state)
    }));
}

module.exports = {
    defaultConfig,
    normalizeUserState,
    getLevelingConfig,
    setLevelingConfig,
    getUserState,
    setUserState,
    listGuildUsers
};
