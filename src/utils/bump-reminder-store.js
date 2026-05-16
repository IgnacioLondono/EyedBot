const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'bump-reminder-configs.json');
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

function defaultConfig() {
    return {
        enabled: false,
        channelId: '',
        intervalMinutes: 120,
        message: '🔔 Ya puedes hacer `/bump` en Disboard.',
        pingRoleId: '',
        bumpXpBonus: 100,
        nextReminderAt: '',
        waitingForBump: false,
        updatedAt: new Date().toISOString(),
        updatedBy: 'system'
    };
}

function normalizeConfig(raw = {}) {
    const base = defaultConfig();
    const intervalRaw = Number.parseInt(`${raw.intervalMinutes ?? base.intervalMinutes}`, 10);
    const intervalMinutes = Math.max(15, Math.min(720, Number.isFinite(intervalRaw) ? intervalRaw : base.intervalMinutes));

    return {
        enabled: raw.enabled === true,
        channelId: String(raw.channelId || '').trim(),
        intervalMinutes,
        message: String(raw.message || base.message).slice(0, 1500),
        pingRoleId: String(raw.pingRoleId || '').replace(/\D/g, '').slice(0, 24),
        bumpXpBonus: Math.max(0, Math.min(5000, Number.parseInt(`${raw.bumpXpBonus ?? base.bumpXpBonus}`, 10) || base.bumpXpBonus)),
        nextReminderAt: String(raw.nextReminderAt || ''),
        waitingForBump: raw.waitingForBump === true,
        updatedAt: String(raw.updatedAt || new Date().toISOString()),
        updatedBy: String(raw.updatedBy || 'system')
    };
}

async function getBumpReminderConfig(guildId) {
    const cacheKey = `bump_reminder_cfg_${guildId}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(`bump_reminder_config_${guildId}`);
        if (fromDb && typeof fromDb === 'object') {
            const normalized = normalizeConfig(fromDb);
            cacheSet(cacheKey, normalized);
            return normalized;
        }
    } catch {
        // fallback a archivo local
    }

    const store = readStore();
    const cfg = normalizeConfig(store.guilds[guildId] || defaultConfig());
    cacheSet(cacheKey, cfg);
    return cfg;
}

async function setBumpReminderConfig(guildId, config) {
    const normalized = normalizeConfig(config);

    try {
        await db.set(`bump_reminder_config_${guildId}`, normalized);
    } catch {
        // fallback a archivo local
    }

    const store = readStore();
    store.guilds[guildId] = normalized;
    writeStore(store);
    cacheSet(`bump_reminder_cfg_${guildId}`, normalized);
    return normalized;
}

async function listAllBumpReminderConfigs() {
    const fromDb = [];
    try {
        const rows = await db.query(
            'SELECT `key`, `value` FROM key_value_store WHERE `key` LIKE ?',
            ['bump_reminder_config_%']
        );

        for (const row of rows) {
            const key = String(row.key || '');
            const guildId = key.replace(/^bump_reminder_config_/, '');
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
    normalizeConfig,
    getBumpReminderConfig,
    setBumpReminderConfig,
    listAllBumpReminderConfigs
};
