const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'ticket-configs.json');

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
        store.guilds[guildId] = { ticketConfig: null };
    }
    return store.guilds[guildId];
}

async function getTicketConfig(guildId) {
    try {
        const fromDb = await db.get(`ticket_config_${guildId}`);
        if (fromDb && typeof fromDb === 'object') return fromDb;
    } catch {
        // fallback to local file
    }

    const store = readStore();
    return store.guilds[guildId]?.ticketConfig || null;
}

async function setTicketConfig(guildId, config) {
    try {
        await db.set(`ticket_config_${guildId}`, config);
    } catch {
        // still persist on local file
    }

    const store = readStore();
    const bucket = ensureGuildBucket(store, guildId);
    bucket.ticketConfig = config;
    writeStore(store);
    return true;
}

module.exports = {
    getTicketConfig,
    setTicketConfig
};
