const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'stream-alert-configs.json');
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

function defaultSource() {
    return {
        id: `src_${Date.now()}`,
        enabled: true,
        platform: 'youtube',
        name: 'Canal',
        url: '',
        feedUrl: '',
        imageUrl: '',
        lastItemId: '',
        lastPostedAt: ''
    };
}

function defaultConfig() {
    return {
        enabled: false,
        channelId: '',
        mentionText: '',
        titleTemplate: '🔴 {platform}: {name} en directo',
        descriptionTemplate: '{title}\n{url}',
        color: '7c4dff',
        footerText: 'EyedBot Stream Alerts',
        sources: [],
        updatedAt: new Date().toISOString(),
        updatedBy: 'system'
    };
}

function normalizeSource(raw = {}) {
    const base = defaultSource();
    return {
        id: String(raw.id || base.id),
        enabled: raw.enabled !== false,
        platform: ['twitch', 'youtube', 'tiktok', 'custom'].includes(String(raw.platform || '').toLowerCase())
            ? String(raw.platform || '').toLowerCase()
            : 'custom',
        name: String(raw.name || base.name).slice(0, 80),
        url: String(raw.url || '').trim().slice(0, 600),
        feedUrl: String(raw.feedUrl || '').trim().slice(0, 800),
        imageUrl: String(raw.imageUrl || '').trim().slice(0, 800),
        lastItemId: String(raw.lastItemId || '').slice(0, 500),
        lastPostedAt: String(raw.lastPostedAt || '')
    };
}

function normalizeConfig(raw = {}) {
    const base = defaultConfig();
    const sources = Array.isArray(raw.sources)
        ? raw.sources.map((item) => normalizeSource(item)).slice(0, 20)
        : [];

    return {
        enabled: raw.enabled === true,
        channelId: String(raw.channelId || '').trim(),
        mentionText: String(raw.mentionText || '').slice(0, 300),
        titleTemplate: String(raw.titleTemplate || base.titleTemplate).slice(0, 200),
        descriptionTemplate: String(raw.descriptionTemplate || base.descriptionTemplate).slice(0, 1500),
        color: String(raw.color || base.color).replace('#', '').slice(0, 6) || base.color,
        footerText: String(raw.footerText || base.footerText).slice(0, 200),
        sources,
        updatedAt: raw.updatedAt || new Date().toISOString(),
        updatedBy: String(raw.updatedBy || 'system')
    };
}

async function getStreamAlertConfig(guildId) {
    const cacheKey = `stream_alert_cfg_${guildId}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(`stream_alert_config_${guildId}`);
        if (fromDb && typeof fromDb === 'object') {
            const normalized = normalizeConfig(fromDb);
            cacheSet(cacheKey, normalized);
            return normalized;
        }
    } catch {
        // fallback to file
    }

    const store = readStore();
    const cfg = normalizeConfig(store.guilds[guildId] || defaultConfig());
    cacheSet(cacheKey, cfg);
    return cfg;
}

async function setStreamAlertConfig(guildId, config) {
    const normalized = normalizeConfig(config);

    try {
        await db.set(`stream_alert_config_${guildId}`, normalized);
    } catch {
        // fallback to file
    }

    const store = readStore();
    store.guilds[guildId] = normalized;
    writeStore(store);
    cacheSet(`stream_alert_cfg_${guildId}`, normalized);
    return normalized;
}

async function listAllStreamAlertConfigs() {
    const fromDb = [];
    try {
        const rows = await db.query(
            'SELECT `key`, `value` FROM key_value_store WHERE `key` LIKE ?',
            ['stream_alert_config_%']
        );

        for (const row of rows) {
            const key = String(row.key || '');
            const guildId = key.replace(/^stream_alert_config_/, '');
            if (!guildId) continue;

            let parsed = null;
            try {
                parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
            } catch {
                parsed = null;
            }

            if (parsed && typeof parsed === 'object') {
                fromDb.push({ guildId, config: normalizeConfig(parsed) });
            }
        }
    } catch {
        // fallback only file
    }

    const store = readStore();
    const fromFile = Object.entries(store.guilds || {}).map(([guildId, raw]) => ({
        guildId,
        config: normalizeConfig(raw || {})
    }));

    const merged = new Map();
    for (const item of fromFile) merged.set(String(item.guildId), item.config);
    for (const item of fromDb) merged.set(String(item.guildId), item.config);

    return Array.from(merged.entries()).map(([guildId, config]) => ({ guildId, config }));
}

module.exports = {
    defaultConfig,
    defaultSource,
    normalizeConfig,
    normalizeSource,
    getStreamAlertConfig,
    setStreamAlertConfig,
    listAllStreamAlertConfigs
};
