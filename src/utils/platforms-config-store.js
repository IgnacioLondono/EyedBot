'use strict';

const fs = require('fs');
const path = require('path');
const db = require('./database');
const { scopeKey } = require('./config-scope');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'platforms-configs.json');
const CACHE_TTL_MS = Math.max(1000, Number.parseInt(process.env.CONFIG_CACHE_TTL_MS || '60000', 10));
const cache = new Map();

const DEFAULT_PLATFORMS = [
    { id: 'pc', label: 'PC', emoji: '🖥️', roleId: '', enabled: true },
    { id: 'playstation', label: 'PlayStation', emoji: '🎮', roleId: '', enabled: true },
    { id: 'xbox', label: 'Xbox', emoji: '🟩', roleId: '', enabled: true },
    { id: 'nintendo', label: 'Nintendo Switch', emoji: '🕹️', roleId: '', enabled: true },
    { id: 'steam', label: 'Steam', emoji: '💨', roleId: '', enabled: true }
];

function defaultConfig() {
    return {
        enabled: true,
        channelId: '',
        messageId: '',
        title: '¿En qué jugás?',
        message: 'Elegí tus plataformas para que la comunidad sepa dónde encontrarte.\nPodés marcar más de una.',
        color: '7c4dff',
        footer: 'Tocá un botón para añadir o quitar el rol',
        mode: 'buttons',
        exclusive: false,
        platforms: DEFAULT_PLATFORMS.map((p) => ({ ...p }))
    };
}

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
        store.guilds[guildId] = { platformsConfig: null };
    }
    return store.guilds[guildId];
}

function normalizePlatform(raw = {}, fallback = {}) {
    const id = String(raw.id || fallback.id || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 32);
    if (!id) return null;
    return {
        id,
        label: String(raw.label || fallback.label || id).trim().slice(0, 80) || id,
        emoji: String(raw.emoji || fallback.emoji || '').trim().slice(0, 80),
        roleId: String(raw.roleId || raw.role_id || fallback.roleId || '').trim(),
        enabled: raw.enabled === false ? false : true
    };
}

function normalizeConfig(raw = {}) {
    const base = defaultConfig();
    const list = Array.isArray(raw.platforms) ? raw.platforms : base.platforms;
    const platforms = list
        .map((item, index) => normalizePlatform(item, base.platforms[index] || {}))
        .filter(Boolean)
        .slice(0, 25);

    const mode = String(raw.mode || base.mode).toLowerCase() === 'select' ? 'select' : 'buttons';

    return {
        enabled: raw.enabled === false ? false : true,
        channelId: String(raw.channelId || raw.channel_id || '').trim(),
        messageId: String(raw.messageId || raw.message_id || '').trim(),
        title: String(raw.title != null ? raw.title : base.title).trim().slice(0, 256) || base.title,
        message: String(raw.message != null ? raw.message : base.message).trim().slice(0, 4000) || base.message,
        color: String(raw.color || base.color).replace('#', '').trim().slice(0, 8) || base.color,
        footer: String(raw.footer != null ? raw.footer : base.footer).trim().slice(0, 2048),
        mode,
        exclusive: raw.exclusive === true,
        platforms: platforms.length ? platforms : base.platforms.map((p) => ({ ...p })),
        updatedAt: raw.updatedAt || null,
        updatedBy: raw.updatedBy || null
    };
}

async function getPlatformsConfig(guildId) {
    guildId = scopeKey(guildId);
    const cacheKey = `platformsConfig_${guildId}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(`platforms_config_${guildId}`);
        if (fromDb && typeof fromDb === 'object') {
            const normalized = normalizeConfig(fromDb);
            cacheSet(cacheKey, normalized);
            return normalized;
        }
    } catch {
        // fallback
    }

    const store = readStore();
    const fallback = store.guilds[guildId]?.platformsConfig || null;
    const normalized = normalizeConfig(fallback || defaultConfig());
    cacheSet(cacheKey, normalized);
    return normalized;
}

async function setPlatformsConfig(guildId, config) {
    guildId = scopeKey(guildId);
    const normalized = normalizeConfig(config || {});
    try {
        await db.set(`platforms_config_${guildId}`, normalized);
    } catch {
        // still persist on local file
    }

    const store = readStore();
    const bucket = ensureGuildBucket(store, guildId);
    bucket.platformsConfig = normalized;
    writeStore(store);
    cacheSet(`platformsConfig_${guildId}`, normalized);
    return normalized;
}

module.exports = {
    DEFAULT_PLATFORMS,
    defaultConfig,
    normalizeConfig,
    getPlatformsConfig,
    setPlatformsConfig
};
