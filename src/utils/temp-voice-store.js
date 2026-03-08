const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'temp-voice-configs.json');
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
        store.guilds[guildId] = {
            config: null,
            activeByUser: {},
            ownerByChannel: {},
            customNames: {}
        };
    }

    if (!store.guilds[guildId].activeByUser || typeof store.guilds[guildId].activeByUser !== 'object') {
        store.guilds[guildId].activeByUser = {};
    }
    if (!store.guilds[guildId].ownerByChannel || typeof store.guilds[guildId].ownerByChannel !== 'object') {
        store.guilds[guildId].ownerByChannel = {};
    }
    if (!store.guilds[guildId].customNames || typeof store.guilds[guildId].customNames !== 'object') {
        store.guilds[guildId].customNames = {};
    }

    return store.guilds[guildId];
}

function defaultConfig() {
    return {
        enabled: false,
        creatorChannelId: '',
        categoryId: '',
        channelNameTemplate: 'Canal de {username}',
        allowCustomNames: true,
        userLimit: 0,
        updatedAt: new Date().toISOString(),
        updatedBy: 'system'
    };
}

async function getTempVoiceConfig(guildId) {
    const cacheKey = `tempVoice_cfg_${guildId}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(`temp_voice_config_${guildId}`);
        if (fromDb && typeof fromDb === 'object') {
            cacheSet(cacheKey, fromDb);
            return fromDb;
        }
    } catch {
        // fallback to file
    }

    const store = readStore();
    const cfg = store.guilds[guildId]?.config || defaultConfig();
    cacheSet(cacheKey, cfg);
    return cfg;
}

async function setTempVoiceConfig(guildId, config) {
    try {
        await db.set(`temp_voice_config_${guildId}`, config);
    } catch {
        // fallback to file
    }

    const store = readStore();
    const bucket = ensureGuildBucket(store, guildId);
    bucket.config = config;
    writeStore(store);
    cacheSet(`tempVoice_cfg_${guildId}`, config || null);
    return true;
}

async function getActiveChannelId(guildId, userId) {
    const cacheKey = `tempVoice_active_${guildId}_${userId}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(`temp_voice_active_${guildId}_${userId}`);
        if (typeof fromDb === 'string' && fromDb) {
            cacheSet(cacheKey, fromDb);
            return fromDb;
        }
    } catch {
        // fallback to file
    }

    const store = readStore();
    const active = ensureGuildBucket(store, guildId).activeByUser[String(userId)] || '';
    cacheSet(cacheKey, active);
    return active;
}

async function setActiveChannel(guildId, userId, channelId) {
    try {
        await db.set(`temp_voice_active_${guildId}_${userId}`, channelId || '');
        await db.set(`temp_voice_owner_${guildId}_${channelId}`, String(userId));
    } catch {
        // fallback to file
    }

    const store = readStore();
    const bucket = ensureGuildBucket(store, guildId);
    bucket.activeByUser[String(userId)] = String(channelId || '');
    bucket.ownerByChannel[String(channelId)] = String(userId);
    writeStore(store);
    cacheSet(`tempVoice_active_${guildId}_${userId}`, String(channelId || ''));
    cacheSet(`tempVoice_owner_${guildId}_${channelId}`, String(userId));
    return true;
}

async function getOwnerByChannelId(guildId, channelId) {
    const cacheKey = `tempVoice_owner_${guildId}_${channelId}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(`temp_voice_owner_${guildId}_${channelId}`);
        if (typeof fromDb === 'string' && fromDb) {
            cacheSet(cacheKey, fromDb);
            return fromDb;
        }
    } catch {
        // fallback to file
    }

    const store = readStore();
    const owner = ensureGuildBucket(store, guildId).ownerByChannel[String(channelId)] || '';
    cacheSet(cacheKey, owner);
    return owner;
}

async function clearActiveChannel(guildId, userId, channelId) {
    try {
        await db.set(`temp_voice_active_${guildId}_${userId}`, '');
        if (channelId) await db.set(`temp_voice_owner_${guildId}_${channelId}`, '');
    } catch {
        // fallback to file
    }

    const store = readStore();
    const bucket = ensureGuildBucket(store, guildId);
    delete bucket.activeByUser[String(userId)];
    if (channelId) delete bucket.ownerByChannel[String(channelId)];
    writeStore(store);
    cacheSet(`tempVoice_active_${guildId}_${userId}`, '');
    if (channelId) cacheSet(`tempVoice_owner_${guildId}_${channelId}`, '');
    return true;
}

async function getUserCustomName(guildId, userId) {
    const cacheKey = `tempVoice_name_${guildId}_${userId}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(`temp_voice_name_${guildId}_${userId}`);
        if (typeof fromDb === 'string') {
            cacheSet(cacheKey, fromDb);
            return fromDb;
        }
    } catch {
        // fallback to file
    }

    const store = readStore();
    const name = ensureGuildBucket(store, guildId).customNames[String(userId)] || '';
    cacheSet(cacheKey, name);
    return name;
}

async function setUserCustomName(guildId, userId, name) {
    const safe = String(name || '').trim();

    try {
        await db.set(`temp_voice_name_${guildId}_${userId}`, safe);
    } catch {
        // fallback to file
    }

    const store = readStore();
    const bucket = ensureGuildBucket(store, guildId);
    if (!safe) {
        delete bucket.customNames[String(userId)];
    } else {
        bucket.customNames[String(userId)] = safe;
    }
    writeStore(store);
    cacheSet(`tempVoice_name_${guildId}_${userId}`, safe);
    return safe;
}

module.exports = {
    defaultConfig,
    getTempVoiceConfig,
    setTempVoiceConfig,
    getActiveChannelId,
    setActiveChannel,
    getOwnerByChannelId,
    clearActiveChannel,
    getUserCustomName,
    setUserCustomName
};
