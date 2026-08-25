const fs = require('fs');
const path = require('path');
const db = require('./database');
const { scopeKey } = require('./config-scope');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'anti-raid-configs.json');
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
        store.guilds[guildId] = { config: null };
    }
    return store.guilds[guildId];
}

function defaultConfig() {
    return {
        enabled: true,
        antiSpamEnabled: true,
        spamMessages: 7,
        spamWindowSec: 8,
        blockInvites: true,
        blockLinks: false,
        maxMentions: 6,
        joinRateThreshold: 8,
        accountAgeDays: 3,
        actionMode: 'timeout',
        timeoutMinutes: 30,
        protectChannels: true,
        protectRoles: true,
        destructiveActionThreshold: 3,
        actionWindowSec: 60,
        trustedRoleIds: [],
        alertChannelId: '',
        /** Filtro de bots al unirse */
        botFilterEnabled: false,
        /** verified_only | allowlist_only | log_only */
        botFilterMode: 'verified_only',
        /** kick | ban | log */
        botFilterAction: 'kick',
        /** IDs de bots siempre permitidos (aunque no estén verificados) */
        botAllowlistIds: [],
        /** Rol opcional para bots permitidos (ej. «Bots») */
        botRoleId: '',
        updatedAt: new Date().toISOString(),
        updatedBy: 'system'
    };
}

async function getAntiRaidConfig(guildId) {
    guildId = scopeKey(guildId);
    const cacheKey = `antiRaid_cfg_${guildId}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(`anti_raid_config_${guildId}`);
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

async function setAntiRaidConfig(guildId, config) {
    guildId = scopeKey(guildId);
    try {
        await db.set(`anti_raid_config_${guildId}`, config);
    } catch {
        // fallback to file
    }

    const store = readStore();
    const bucket = ensureGuildBucket(store, guildId);
    bucket.config = config;
    writeStore(store);
    cacheSet(`antiRaid_cfg_${guildId}`, config || null);
    return true;
}

module.exports = {
    defaultConfig,
    getAntiRaidConfig,
    setAntiRaidConfig
};
