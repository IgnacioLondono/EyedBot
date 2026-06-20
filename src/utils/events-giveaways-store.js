const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'events-giveaways.json');
const CACHE_TTL_MS = Math.max(1000, Number.parseInt(process.env.CONFIG_CACHE_TTL_MS || '60000', 10));
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
        const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8') || '{}');
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
        enabled: true,
        defaultChannelId: '',
        color: 'a78bfa',
        managerRoleIds: [],
        reminderMinutesBefore: 60,
        updatedAt: new Date().toISOString(),
        updatedBy: 'system'
    };
}

function normalizeConfig(raw = {}) {
    const base = defaultConfig();
    return {
        enabled: raw.enabled !== false,
        defaultChannelId: String(raw.defaultChannelId || '').trim(),
        color: String(raw.color || base.color).replace('#', '').slice(0, 6) || base.color,
        managerRoleIds: Array.isArray(raw.managerRoleIds)
            ? raw.managerRoleIds.map((id) => String(id)).filter(Boolean).slice(0, 20)
            : [],
        reminderMinutesBefore: Math.max(5, Math.min(1440, Number.parseInt(raw.reminderMinutesBefore ?? base.reminderMinutesBefore, 10) || base.reminderMinutesBefore)),
        updatedAt: raw.updatedAt || new Date().toISOString(),
        updatedBy: String(raw.updatedBy || 'system')
    };
}

function normalizeGiveaway(raw = {}) {
    return {
        id: String(raw.id || crypto.randomUUID()),
        guildId: String(raw.guildId || ''),
        channelId: String(raw.channelId || ''),
        messageId: String(raw.messageId || ''),
        title: String(raw.title || 'Sorteo').slice(0, 256),
        prize: String(raw.prize || '').slice(0, 500),
        description: String(raw.description || '').slice(0, 2000),
        winnersCount: Math.max(1, Math.min(20, Number.parseInt(raw.winnersCount ?? 1, 10) || 1)),
        hostId: String(raw.hostId || ''),
        requiredRoleId: String(raw.requiredRoleId || '').trim(),
        endsAt: String(raw.endsAt || ''),
        color: String(raw.color || '').replace('#', '').slice(0, 6),
        status: ['active', 'ended', 'cancelled'].includes(raw.status) ? raw.status : 'active',
        entries: Array.isArray(raw.entries) ? [...new Set(raw.entries.map((id) => String(id)).filter(Boolean))] : [],
        winners: Array.isArray(raw.winners) ? raw.winners.map((id) => String(id)).filter(Boolean) : [],
        createdAt: raw.createdAt || new Date().toISOString(),
        endedAt: raw.endedAt || null
    };
}

function normalizeServerEvent(raw = {}) {
    return {
        id: String(raw.id || crypto.randomUUID()),
        guildId: String(raw.guildId || ''),
        channelId: String(raw.channelId || ''),
        messageId: String(raw.messageId || ''),
        title: String(raw.title || 'Evento').slice(0, 256),
        description: String(raw.description || '').slice(0, 2000),
        location: String(raw.location || '').slice(0, 300),
        startAt: String(raw.startAt || ''),
        status: ['scheduled', 'published', 'cancelled', 'completed'].includes(raw.status) ? raw.status : 'scheduled',
        reminderSent: raw.reminderSent === true,
        hostId: String(raw.hostId || ''),
        createdAt: raw.createdAt || new Date().toISOString()
    };
}

function defaultBucket() {
    return { config: defaultConfig(), giveaways: [], events: [] };
}

function ensureGuildBucket(store, guildId) {
    if (!store.guilds[guildId]) store.guilds[guildId] = defaultBucket();
    const bucket = store.guilds[guildId];
    if (!bucket.config) bucket.config = defaultConfig();
    if (!Array.isArray(bucket.giveaways)) bucket.giveaways = [];
    if (!Array.isArray(bucket.events)) bucket.events = [];
    return bucket;
}

async function readGuildBucket(guildId) {
    const cacheKey = `eventsGiveaways_${guildId}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache) return fromCache;

    try {
        const fromDb = await db.get(`events_giveaways_${guildId}`);
        if (fromDb && typeof fromDb === 'object') {
            const bucket = {
                config: normalizeConfig(fromDb.config),
                giveaways: Array.isArray(fromDb.giveaways) ? fromDb.giveaways.map(normalizeGiveaway) : [],
                events: Array.isArray(fromDb.events) ? fromDb.events.map(normalizeServerEvent) : []
            };
            cacheSet(cacheKey, bucket);
            return bucket;
        }
    } catch {
        // fallback file
    }

    const store = readStore();
    const bucket = ensureGuildBucket(store, guildId);
    const normalized = {
        config: normalizeConfig(bucket.config),
        giveaways: bucket.giveaways.map(normalizeGiveaway),
        events: bucket.events.map(normalizeServerEvent)
    };
    cacheSet(cacheKey, normalized);
    return normalized;
}

async function writeGuildBucket(guildId, bucket) {
    const normalized = {
        config: normalizeConfig(bucket.config),
        giveaways: (bucket.giveaways || []).map(normalizeGiveaway),
        events: (bucket.events || []).map(normalizeServerEvent)
    };

    try {
        await db.set(`events_giveaways_${guildId}`, normalized);
    } catch {
        // still persist file
    }

    const store = readStore();
    store.guilds[guildId] = normalized;
    writeStore(store);
    cacheSet(`eventsGiveaways_${guildId}`, normalized);
    return normalized;
}

async function getConfig(guildId) {
    const bucket = await readGuildBucket(guildId);
    return bucket.config;
}

async function setConfig(guildId, config, updatedBy = 'system') {
    const bucket = await readGuildBucket(guildId);
    bucket.config = normalizeConfig({ ...config, updatedAt: new Date().toISOString(), updatedBy });
    return writeGuildBucket(guildId, bucket);
}

async function listGiveaways(guildId, status = null) {
    const bucket = await readGuildBucket(guildId);
    if (!status) return bucket.giveaways;
    return bucket.giveaways.filter((row) => row.status === status);
}

async function getGiveaway(guildId, giveawayId) {
    const bucket = await readGuildBucket(guildId);
    return bucket.giveaways.find((row) => row.id === giveawayId) || null;
}

async function getGiveawayByMessage(guildId, messageId) {
    const bucket = await readGuildBucket(guildId);
    return bucket.giveaways.find((row) => row.messageId === messageId) || null;
}

async function saveGiveaway(guildId, giveaway) {
    const bucket = await readGuildBucket(guildId);
    const normalized = normalizeGiveaway({ ...giveaway, guildId });
    const index = bucket.giveaways.findIndex((row) => row.id === normalized.id);
    if (index >= 0) bucket.giveaways[index] = normalized;
    else bucket.giveaways.unshift(normalized);
    bucket.giveaways = bucket.giveaways.slice(0, 100);
    await writeGuildBucket(guildId, bucket);
    return normalized;
}

async function listServerEvents(guildId, status = null) {
    const bucket = await readGuildBucket(guildId);
    if (!status) return bucket.events;
    return bucket.events.filter((row) => row.status === status);
}

async function getServerEvent(guildId, eventId) {
    const bucket = await readGuildBucket(guildId);
    return bucket.events.find((row) => row.id === eventId) || null;
}

async function saveServerEvent(guildId, eventRow) {
    const bucket = await readGuildBucket(guildId);
    const normalized = normalizeServerEvent({ ...eventRow, guildId });
    const index = bucket.events.findIndex((row) => row.id === normalized.id);
    if (index >= 0) bucket.events[index] = normalized;
    else bucket.events.unshift(normalized);
    bucket.events = bucket.events.slice(0, 100);
    await writeGuildBucket(guildId, bucket);
    return normalized;
}

async function listAllActiveGiveaways() {
    const store = readStore();
    const out = [];
    for (const [guildId, bucket] of Object.entries(store.guilds || {})) {
        for (const row of bucket.giveaways || []) {
            if (row.status === 'active') out.push(normalizeGiveaway({ ...row, guildId }));
        }
    }
    try {
        // DB keys are per-guild; file sweep above covers fallback. Active giveaways also restored on guild access.
    } catch {
        // noop
    }
    return out;
}

async function listScheduledEventsForReminders() {
    const store = readStore();
    const out = [];
    for (const [guildId, bucket] of Object.entries(store.guilds || {})) {
        for (const row of bucket.events || []) {
            if (row.status === 'published' && !row.reminderSent) {
                out.push(normalizeServerEvent({ ...row, guildId }));
            }
        }
    }
    return out;
}

module.exports = {
    defaultConfig,
    normalizeConfig,
    normalizeGiveaway,
    normalizeServerEvent,
    getConfig,
    setConfig,
    listGiveaways,
    getGiveaway,
    getGiveawayByMessage,
    saveGiveaway,
    listServerEvents,
    getServerEvent,
    saveServerEvent,
    listAllActiveGiveaways,
    listScheduledEventsForReminders,
    readGuildBucket
};
