const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'billing-subscriptions.json');
const CACHE_TTL_MS = Math.max(1000, Number.parseInt(process.env.BILLING_CACHE_TTL_MS || '120000', 10));
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
        fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, events: {} }, null, 2), 'utf8');
    }
}

function readStore() {
    ensureStore();
    try {
        const raw = fs.readFileSync(STORE_PATH, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        if (!parsed || typeof parsed !== 'object') return { users: {}, events: {} };
        if (!parsed.users || typeof parsed.users !== 'object') parsed.users = {};
        if (!parsed.events || typeof parsed.events !== 'object') parsed.events = {};
        return parsed;
    } catch {
        return { users: {}, events: {} };
    }
}

function writeStore(data) {
    ensureStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function normalizeSubscription(raw = {}, userId = '') {
    const status = String(raw.status || 'inactive').trim().toLowerCase();
    const allowedStatuses = new Set(['active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'inactive']);
    const normalizedStatus = allowedStatuses.has(status) ? status : 'inactive';
    return {
        userId: String(userId || raw.userId || '').trim(),
        status: normalizedStatus,
        active: normalizedStatus === 'active' || normalizedStatus === 'trialing',
        customerId: String(raw.customerId || '').trim(),
        subscriptionId: String(raw.subscriptionId || '').trim(),
        currentPeriodEnd: raw.currentPeriodEnd ? new Date(raw.currentPeriodEnd).toISOString() : null,
        cancelAtPeriodEnd: raw.cancelAtPeriodEnd === true,
        sourceEvent: String(raw.sourceEvent || '').trim(),
        lastEventId: String(raw.lastEventId || '').trim(),
        updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : new Date().toISOString()
    };
}

function dbKeyForUser(userId) {
    return `billing_subscription_${String(userId || '').trim()}`;
}

function dbKeyForEvent(eventId) {
    return `billing_event_processed_${String(eventId || '').trim()}`;
}

async function getUserSubscription(userId) {
    const id = String(userId || '').trim();
    if (!id) return normalizeSubscription({}, '');

    const cacheKey = `billing_subscription_${id}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache !== null) return fromCache;

    try {
        const fromDb = await db.get(dbKeyForUser(id));
        if (fromDb && typeof fromDb === 'object') {
            const normalized = normalizeSubscription(fromDb, id);
            cacheSet(cacheKey, normalized);
            return normalized;
        }
    } catch {
        // fallback
    }

    const store = readStore();
    const normalized = normalizeSubscription(store.users[id] || {}, id);
    cacheSet(cacheKey, normalized);
    return normalized;
}

async function setUserSubscription(userId, payload) {
    const id = String(userId || '').trim();
    if (!id) return normalizeSubscription({}, '');
    const normalized = normalizeSubscription(payload || {}, id);

    try {
        await db.set(dbKeyForUser(id), normalized);
    } catch {
        // fallback
    }

    const store = readStore();
    store.users[id] = normalized;
    writeStore(store);
    cacheSet(`billing_subscription_${id}`, normalized);
    return normalized;
}

async function markEventProcessed(eventId, metadata = {}) {
    const id = String(eventId || '').trim();
    if (!id) return false;
    const payload = {
        processed: true,
        sourceEvent: String(metadata.sourceEvent || '').trim(),
        processedAt: new Date().toISOString()
    };

    try {
        await db.set(dbKeyForEvent(id), payload);
    } catch {
        // fallback
    }

    const store = readStore();
    store.events[id] = payload;
    writeStore(store);
    cacheSet(`billing_event_${id}`, payload);
    return true;
}

async function hasProcessedEvent(eventId) {
    const id = String(eventId || '').trim();
    if (!id) return false;
    const cacheKey = `billing_event_${id}`;
    const fromCache = cacheGet(cacheKey);
    if (fromCache && typeof fromCache === 'object') return fromCache.processed === true;

    try {
        const fromDb = await db.get(dbKeyForEvent(id));
        if (fromDb && typeof fromDb === 'object') {
            cacheSet(cacheKey, fromDb);
            return fromDb.processed === true;
        }
    } catch {
        // fallback
    }

    const store = readStore();
    const fromFile = store.events[id] || null;
    if (fromFile && typeof fromFile === 'object') {
        cacheSet(cacheKey, fromFile);
        return fromFile.processed === true;
    }
    return false;
}

function isPremiumActive(subscription) {
    const status = String(subscription?.status || '').toLowerCase();
    return status === 'active' || status === 'trialing';
}

module.exports = {
    normalizeSubscription,
    getUserSubscription,
    setUserSubscription,
    hasProcessedEvent,
    markEventProcessed,
    isPremiumActive
};
