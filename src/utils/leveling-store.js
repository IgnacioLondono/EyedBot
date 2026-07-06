const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'leveling-store.json');
const CACHE_TTL_MS = Math.max(1000, Number.parseInt(process.env.CONFIG_CACHE_TTL_MS || '120000', 10));
/** Espejo JSON local; por defecto desactivado (MySQL es la fuente principal). */
const FILE_MIRROR = String(process.env.LEVELING_FILE_MIRROR || 'false').trim().toLowerCase() === 'true';
const FILE_WRITE_BLOCK_MS = Math.max(60_000, Number.parseInt(process.env.LEVELING_FILE_BLOCK_MS || '1800000', 10) || 1_800_000);
const FILE_WRITE_WARN_MS = Math.max(60_000, Number.parseInt(process.env.LEVELING_FILE_WARN_MS || '300000', 10) || 300_000);

const cache = new Map();
let fileWriteBlockedUntil = 0;
let lastFileWriteWarnAt = 0;

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

function isEnospcError(error) {
    const code = String(error?.code || '').toUpperCase();
    return code === 'ENOSPC' || Number(error?.errno) === -28;
}

function warnFileMirrorSkipped(reason) {
    const now = Date.now();
    if (now - lastFileWriteWarnAt < FILE_WRITE_WARN_MS) return;
    lastFileWriteWarnAt = now;
    console.warn(`⚠️ leveling-store.json: ${reason} (persistiendo solo en MySQL).`);
}

function ensureStore() {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(STORE_PATH)) {
        fs.writeFileSync(STORE_PATH, JSON.stringify({ guilds: {} }, null, 2), 'utf8');
    }
}

function readStore() {
    try {
        ensureStore();
    } catch (error) {
        if (isEnospcError(error)) {
            warnFileMirrorSkipped('sin espacio para crear el archivo local');
            return { guilds: {} };
        }
        throw error;
    }

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

function writeStoreSafe(data) {
    if (!FILE_MIRROR) return false;
    if (Date.now() < fileWriteBlockedUntil) return false;

    try {
        ensureStore();
        fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        if (isEnospcError(error)) {
            fileWriteBlockedUntil = Date.now() + FILE_WRITE_BLOCK_MS;
            warnFileMirrorSkipped('disco lleno (ENOSPC)');
            return false;
        }
        console.error('Error escribiendo leveling-store.json:', error?.message || error);
        return false;
    }
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

async function persistToDatabase(key, value) {
    try {
        if (typeof db.isAvailable === 'function' && !db.isAvailable()) return false;
        await db.set(key, value);
        return typeof db.isAvailable !== 'function' || db.isAvailable();
    } catch {
        return false;
    }
}

function mirrorConfigToFile(guildId, config) {
    if (!FILE_MIRROR) return;
    const store = readStore();
    const bucket = ensureGuildBucket(store, guildId);
    bucket.config = config;
    writeStoreSafe(store);
}

function mirrorUserToFile(guildId, userId, normalized) {
    if (!FILE_MIRROR) return;
    const store = readStore();
    const bucket = ensureGuildBucket(store, guildId);
    bucket.users[userId] = normalized;
    writeStoreSafe(store);
}

const { DEFAULT_LEVEL_TIERS } = require('./level-tier-defaults');

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
        /** Multiplicador de XP ganada por mensajes y voz (1 = normal, 2 = doble, etc.). */
        xpMultiplier: 1,
        difficulty: {
            baseXp: 280,
            exponent: 2.08
        },
        tiers: DEFAULT_LEVEL_TIERS.map((tier) => ({ ...tier })),
        roleRewards: [],
        /** Canal de texto (ID) donde avisar subidas de nivel; mensaje plano, sin embed */
        levelUpAnnounceChannelId: '',
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
    const dbOk = await persistToDatabase(`leveling_config_${guildId}`, config);
    cacheSet(`leveling_cfg_${guildId}`, config);

    if (!dbOk) {
        mirrorConfigToFile(guildId, config);
    } else if (FILE_MIRROR) {
        mirrorConfigToFile(guildId, config);
    }

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
    const dbOk = await persistToDatabase(`leveling_user_${guildId}_${userId}`, normalized);
    cacheSet(`leveling_user_${guildId}_${userId}`, normalized);

    if (!dbOk) {
        mirrorUserToFile(guildId, userId, normalized);
    } else if (FILE_MIRROR) {
        mirrorUserToFile(guildId, userId, normalized);
    }

    return normalized;
}

async function incrementUserStats(guildId, userId, changes = {}) {
    const current = await getUserState(guildId, userId);
    const next = normalizeUserState({
        ...current,
        messageCount: (Number.parseInt(current.messageCount || 0, 10) || 0) + Math.max(0, Number.parseInt(changes.messageCount || 0, 10) || 0),
        voiceMinutes: (Number.parseInt(current.voiceMinutes || 0, 10) || 0) + Math.max(0, Number.parseInt(changes.voiceMinutes || 0, 10) || 0),
        updatedAt: new Date().toISOString()
    });

    return setUserState(guildId, userId, next);
}

function listGuildUsers(guildId) {
    const store = readStore();
    const gid = String(guildId);
    const users = store.guilds[guildId]?.users || store.guilds[gid]?.users || {};
    return Object.entries(users).map(([userId, state]) => ({
        userId,
        ...normalizeUserState(state)
    }));
}

function mergeLevelingRows(a, b) {
    const ax = Number.parseInt(a.xp || 0, 10) || 0;
    const bx = Number.parseInt(b.xp || 0, 10) || 0;
    const aMsgs = Number.parseInt(a.messageCount || 0, 10) || 0;
    const bMsgs = Number.parseInt(b.messageCount || 0, 10) || 0;
    const aVoice = Number.parseInt(a.voiceMinutes || 0, 10) || 0;
    const bVoice = Number.parseInt(b.voiceMinutes || 0, 10) || 0;
    const aTime = Date.parse(a.updatedAt || '') || 0;
    const bTime = Date.parse(b.updatedAt || '') || 0;
    const pickNewer = bTime > aTime ? b : a;
    const pickOlder = bTime > aTime ? a : b;

    return normalizeUserState({
        xp: Math.max(ax, bx),
        level: Math.max(
            Number.parseInt(a.level || 0, 10) || 0,
            Number.parseInt(b.level || 0, 10) || 0
        ),
        messageCount: Math.max(aMsgs, bMsgs),
        voiceMinutes: Math.max(aVoice, bVoice),
        updatedAt: pickNewer.updatedAt || pickOlder.updatedAt
    });
}

/** Usuarios con datos de nivelación en archivo local + MySQL (unión por userId). */
async function listGuildUsersMerged(guildId) {
    const gid = String(guildId);
    const map = new Map();
    const fromFile = listGuildUsers(gid);
    for (const row of fromFile) {
        if (!row?.userId) continue;
        map.set(row.userId, { userId: row.userId, ...normalizeUserState(row) });
    }

    let fromDb = [];
    try {
        fromDb = await db.listLevelingUserKeysForGuild(gid);
    } catch {
        fromDb = [];
    }

    const prefix = `leveling_user_${gid}_`;
    for (const { key, value } of fromDb) {
        if (!key || typeof key !== 'string' || !key.startsWith(prefix)) continue;
        const userId = key.slice(prefix.length);
        if (!/^\d{10,25}$/.test(userId)) continue;
        const normalized = normalizeUserState(value && typeof value === 'object' ? value : {});
        const prev = map.get(userId);
        if (!prev) {
            map.set(userId, { userId, ...normalized });
        } else {
            map.set(userId, { userId, ...mergeLevelingRows(prev, normalized) });
        }
    }

    return Array.from(map.values());
}

module.exports = {
    defaultConfig,
    normalizeUserState,
    getLevelingConfig,
    setLevelingConfig,
    getUserState,
    setUserState,
    incrementUserStats,
    listGuildUsers,
    listGuildUsersMerged
};
