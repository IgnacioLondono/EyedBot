const { AsyncLocalStorage } = require('async_hooks');

const MAIN_BOT_ID = 'main';
const als = new AsyncLocalStorage();

function normalizeBotId(botId) {
    const raw = String(botId || '').trim();
    if (!raw || raw === MAIN_BOT_ID) return MAIN_BOT_ID;
    return raw;
}

function scopedGuildKey(botId, guildId) {
    const g = String(guildId || '').trim();
    if (!g) return '';
    const b = normalizeBotId(botId);
    // Compat: el bot principal sigue usando claves sin prefijo.
    if (b === MAIN_BOT_ID) return g;
    return `${b}:${g}`;
}

function parseScopedGuildKey(key) {
    const raw = String(key || '');
    const idx = raw.indexOf(':');
    if (idx <= 0) return { botId: MAIN_BOT_ID, guildId: raw };
    const botId = raw.slice(0, idx);
    const guildId = raw.slice(idx + 1);
    // botId interno (hex) + snowflake de guild
    if (/^[a-f0-9]{8,32}$/i.test(botId) && /^\d{5,25}$/.test(guildId)) {
        return { botId, guildId };
    }
    return { botId: MAIN_BOT_ID, guildId: raw };
}

function runWithBotScope(botId, fn) {
    return als.run({ botId: normalizeBotId(botId) }, fn);
}

function currentBotId() {
    return normalizeBotId(als.getStore()?.botId);
}

function scopeKey(guildId) {
    const raw = String(guildId || '').trim();
    if (!raw) return '';
    const current = currentBotId();
    // Idempotente: si ya viene con el prefijo del bot actual, no volver a prefijar.
    if (current !== MAIN_BOT_ID && raw.startsWith(`${current}:`)) {
        return raw;
    }
    if (raw.includes(':')) {
        const parsed = parseScopedGuildKey(raw);
        if (parsed.botId !== MAIN_BOT_ID) {
            return scopedGuildKey(parsed.botId, parsed.guildId);
        }
    }
    return scopedGuildKey(current, raw);
}

function isMainBotScope() {
    return currentBotId() === MAIN_BOT_ID;
}

module.exports = {
    MAIN_BOT_ID,
    normalizeBotId,
    scopedGuildKey,
    parseScopedGuildKey,
    runWithBotScope,
    currentBotId,
    scopeKey,
    isMainBotScope
};
