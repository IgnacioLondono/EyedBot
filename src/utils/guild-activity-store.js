const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'guild-activity-store.json');

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

function normalizeMetric(value) {
    return Math.max(0, Number.parseInt(value || 0, 10) || 0);
}

function normalizeDailyEntry(raw = {}) {
    return {
        joins: normalizeMetric(raw.joins),
        leaves: normalizeMetric(raw.leaves)
    };
}

function normalizeActivity(raw = {}) {
    const dailySource = raw.daily && typeof raw.daily === 'object' ? raw.daily : {};
    const daily = {};

    Object.entries(dailySource).forEach(([day, entry]) => {
        daily[String(day)] = normalizeDailyEntry(entry);
    });

    return {
        trackingStartedAt: raw.trackingStartedAt || new Date().toISOString(),
        updatedAt: raw.updatedAt || new Date().toISOString(),
        totals: {
            joins: normalizeMetric(raw.totals?.joins),
            leaves: normalizeMetric(raw.totals?.leaves)
        },
        daily
    };
}

function ensureGuildBucket(store, guildId) {
    if (!store.guilds[guildId] || typeof store.guilds[guildId] !== 'object') {
        store.guilds[guildId] = normalizeActivity({});
    }

    store.guilds[guildId] = normalizeActivity(store.guilds[guildId]);
    return store.guilds[guildId];
}

function dayKey(date = new Date()) {
    return new Date(date).toISOString().slice(0, 10);
}

async function getGuildActivity(guildId) {
    const key = `guild_activity_${guildId}`;

    try {
        const fromDb = await db.get(key);
        if (fromDb && typeof fromDb === 'object') {
            return normalizeActivity(fromDb);
        }
    } catch {
        // fallback to local file
    }

    const store = readStore();
    const bucket = ensureGuildBucket(store, guildId);
    return normalizeActivity(bucket);
}

async function setGuildActivity(guildId, activity) {
    const normalized = normalizeActivity(activity);
    const key = `guild_activity_${guildId}`;

    try {
        await db.set(key, normalized);
    } catch {
        // fallback still writes local file
    }

    const store = readStore();
    store.guilds[guildId] = normalized;
    writeStore(store);

    return normalized;
}

async function incrementGuildMetric(guildId, metric, amount = 1, when = new Date()) {
    const safeMetric = String(metric || '').trim();
    if (!['joins', 'leaves'].includes(safeMetric)) return null;

    const increment = Math.max(1, Number.parseInt(amount || 1, 10) || 1);
    const activity = await getGuildActivity(guildId);
    const key = dayKey(when);

    if (!activity.daily[key]) activity.daily[key] = normalizeDailyEntry();
    activity.daily[key][safeMetric] = normalizeMetric(activity.daily[key][safeMetric]) + increment;
    activity.totals[safeMetric] = normalizeMetric(activity.totals[safeMetric]) + increment;
    activity.updatedAt = new Date().toISOString();

    return setGuildActivity(guildId, activity);
}

module.exports = {
    getGuildActivity,
    setGuildActivity,
    incrementGuildMetric,
    normalizeActivity
};
