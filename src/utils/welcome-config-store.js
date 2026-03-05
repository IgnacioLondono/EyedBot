const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'welcome-configs.json');

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
        store.guilds[guildId] = { welcomeChannelId: null, welcomeConfig: null };
    }
    return store.guilds[guildId];
}

async function getWelcomeChannelId(guildId) {
    try {
        const fromDb = await db.get(`welcome_${guildId}`);
        if (fromDb) return fromDb;
    } catch {
        // ignore db failures and fallback to file
    }

    const store = readStore();
    return store.guilds[guildId]?.welcomeChannelId || null;
}

async function setWelcomeChannelId(guildId, channelId) {
    try {
        await db.set(`welcome_${guildId}`, channelId);
    } catch {
        // ignore db failures and still persist locally
    }

    const store = readStore();
    const bucket = ensureGuildBucket(store, guildId);
    bucket.welcomeChannelId = channelId;
    writeStore(store);
    return true;
}

async function getWelcomeConfig(guildId) {
    try {
        const fromDb = await db.get(`welcome_config_${guildId}`);
        if (fromDb && typeof fromDb === 'object') return fromDb;
    } catch {
        // ignore db failures and fallback to file
    }

    const store = readStore();
    return store.guilds[guildId]?.welcomeConfig || null;
}

async function setWelcomeConfig(guildId, config) {
    try {
        await db.set(`welcome_config_${guildId}`, config);
    } catch {
        // ignore db failures and still persist locally
    }

    const store = readStore();
    const bucket = ensureGuildBucket(store, guildId);
    bucket.welcomeConfig = config;
    if (config?.channelId) bucket.welcomeChannelId = config.channelId;
    writeStore(store);
    return true;
}

module.exports = {
    getWelcomeChannelId,
    setWelcomeChannelId,
    getWelcomeConfig,
    setWelcomeConfig
};
