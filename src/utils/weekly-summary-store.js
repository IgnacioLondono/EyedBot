const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'weekly-summary.json');
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
    try {
        fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch {
        // MySQL sigue siendo la fuente principal; ignorar fallo local.
    }
}

function defaultConfig() {
    return {
        enabled: false,
        channelId: null,
        dayOfWeek: 0,
        hour: 20,
        minute: 0,
        timezone: 'America/Santiago',
        compare: true,
        mentionRoleId: null,
        lastPostedDate: null,
        updatedAt: new Date().toISOString(),
        updatedBy: 'system'
    };
}

function sanitizeConfig(raw) {
    const cfg = raw && typeof raw === 'object' ? { ...raw } : {};
    const dayOfWeek = Number.parseInt(cfg.dayOfWeek, 10);
    const hour = Number.parseInt(cfg.hour, 10);
    const minute = Number.parseInt(cfg.minute, 10);
    return {
        enabled: cfg.enabled === true,
        channelId: cfg.channelId ? String(cfg.channelId) : null,
        dayOfWeek: Number.isFinite(dayOfWeek) ? Math.min(6, Math.max(0, dayOfWeek)) : 0,
        hour: Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 20,
        minute: Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0,
        timezone: String(cfg.timezone || 'America/Santiago'),
        compare: cfg.compare !== false,
        mentionRoleId: cfg.mentionRoleId ? String(cfg.mentionRoleId) : null,
        lastPostedDate: cfg.lastPostedDate ? String(cfg.lastPostedDate) : null,
        updatedAt: cfg.updatedAt || new Date().toISOString(),
        updatedBy: cfg.updatedBy || 'system'
    };
}

function normalizeBucket(raw) {
    const bucket = raw && typeof raw === 'object' ? raw : {};
    return {
        config: sanitizeConfig(bucket.config),
        snapshot: bucket.snapshot && typeof bucket.snapshot === 'object' ? bucket.snapshot : null
    };
}

async function getBucket(guildId) {
    const cacheKey = `weekly_summary_${guildId}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(`weekly_summary_${guildId}`);
        if (fromDb && typeof fromDb === 'object') {
            const normalized = normalizeBucket(fromDb);
            cacheSet(cacheKey, normalized);
            return normalized;
        }
    } catch {
        // fallback local
    }

    const store = readStore();
    const normalized = normalizeBucket(store.guilds[guildId]);
    cacheSet(cacheKey, normalized);
    return normalized;
}

async function setBucket(guildId, bucket) {
    const normalized = normalizeBucket(bucket);

    try {
        await db.set(`weekly_summary_${guildId}`, normalized);
    } catch {
        // fallback local
    }

    const store = readStore();
    store.guilds[guildId] = normalized;
    writeStore(store);
    cacheSet(`weekly_summary_${guildId}`, normalized);
    return normalized;
}

async function getConfig(guildId) {
    return (await getBucket(guildId)).config;
}

async function setConfig(guildId, patch = {}) {
    const bucket = await getBucket(guildId);
    const nextConfig = sanitizeConfig({
        ...bucket.config,
        ...patch,
        updatedAt: new Date().toISOString()
    });
    const next = await setBucket(guildId, { ...bucket, config: nextConfig });
    return next.config;
}

async function getSnapshot(guildId) {
    return (await getBucket(guildId)).snapshot;
}

async function setSnapshot(guildId, snapshot) {
    const bucket = await getBucket(guildId);
    const next = await setBucket(guildId, { ...bucket, snapshot });
    return next.snapshot;
}

async function markPosted(guildId, localDateKey) {
    return setConfig(guildId, { lastPostedDate: localDateKey, updatedBy: 'scheduler' });
}

module.exports = {
    defaultConfig,
    getConfig,
    setConfig,
    getSnapshot,
    setSnapshot,
    markPosted
};
