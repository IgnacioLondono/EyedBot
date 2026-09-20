const fs = require('fs');
const path = require('path');
const { isMainBotScope } = require('./config-scope');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'main-bot-guild-control.json');
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

function cacheBust() {
    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
        if (Number(entry?.expiresAt || 0) <= now) cache.delete(key);
    }
}

function ensureStore() {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(STORE_PATH)) {
        fs.writeFileSync(STORE_PATH, JSON.stringify({ guilds: {}, updatedAt: null }, null, 2), 'utf8');
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

function normalizeBool(value, fallback = false) {
    if (value === true || value === false) return value;
    if (value === 'true' || value === 1 || value === '1') return true;
    if (value === 'false' || value === 0 || value === '0') return false;
    return fallback;
}

const DEFAULT_CONTROL = {
    commandsDisabled: false,
    dataCollectionDisabled: false,
    hiddenFromPanel: false,
    updatedAt: null,
    updatedBy: null
};

function normalizeControl(raw = {}) {
    return {
        commandsDisabled: normalizeBool(raw.commandsDisabled, false),
        dataCollectionDisabled: normalizeBool(raw.dataCollectionDisabled, false),
        hiddenFromPanel: normalizeBool(raw.hiddenFromPanel, false),
        updatedAt: raw.updatedAt || null,
        updatedBy: raw.updatedBy || null
    };
}

function getControl(guildId) {
    const key = String(guildId || '').trim();
    if (!key) return { ...DEFAULT_CONTROL };
    const cached = cacheGet(key);
    if (cached) return cached;

    const store = readStore();
    const control = normalizeControl(store.guilds[key] || {});
    cacheSet(key, control);
    return control;
}

function isCommandsDisabled(guildId) {
    const key = String(guildId || '').trim();
    if (!key) return false;
    if (!isMainBotScope()) return false;
    return getControl(key).commandsDisabled === true;
}

function isDataCollectionDisabled(guildId) {
    const key = String(guildId || '').trim();
    if (!key) return false;
    if (!isMainBotScope()) return false;
    return getControl(key).dataCollectionDisabled === true;
}

function isHiddenFromPanel(guildId) {
    const key = String(guildId || '').trim();
    if (!key) return false;
    if (!isMainBotScope()) return false;
    return getControl(key).hiddenFromPanel === true;
}

function isFullyDisabled(guildId) {
    const control = getControl(guildId);
    return control.commandsDisabled === true
        && control.dataCollectionDisabled === true
        && control.hiddenFromPanel === true;
}

function setControl(guildId, patch = {}, updatedBy = '') {
    const key = String(guildId || '').trim();
    if (!key) throw Object.assign(new Error('Falta guildId'), { statusCode: 400 });

    const store = readStore();
    const current = normalizeControl(store.guilds[key] || {});
    const next = normalizeControl({
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
        updatedBy: String(updatedBy || current.updatedBy || '').trim() || null
    });
    store.guilds[key] = next;
    store.updatedAt = next.updatedAt;
    writeStore(store);
    cacheBust();
    cacheSet(key, next);
    return next;
}

function listControls() {
    const store = readStore();
    const out = {};
    for (const [guildId, raw] of Object.entries(store.guilds || {})) {
        out[guildId] = normalizeControl(raw);
    }
    return out;
}

module.exports = {
    DEFAULT_CONTROL,
    getControl,
    setControl,
    listControls,
    isCommandsDisabled,
    isDataCollectionDisabled,
    isHiddenFromPanel,
    isFullyDisabled
};