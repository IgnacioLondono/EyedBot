const { Routes } = require('discord.js');

const DEFAULT_POST_DELAY_MS = Math.max(500, Number.parseInt(process.env.SLASH_POST_DELAY_MS || '800', 10));
const DEFAULT_REQUEST_TIMEOUT_MS = Math.max(5000, Number.parseInt(process.env.SLASH_REQUEST_TIMEOUT_MS || '20000', 10));
const DEFAULT_BULK_TIMEOUT_MS = Math.max(15000, Number.parseInt(process.env.SLASH_BULK_TIMEOUT_MS || '120000', 10));
const DEFAULT_SETTLE_MS = Math.max(8000, Number.parseInt(process.env.SLASH_SETTLE_MS || '25000', 10));
const DEFAULT_INCREMENTAL_ROUNDS = Math.max(1, Number.parseInt(process.env.SLASH_INCREMENTAL_ROUNDS || '15', 10));

function parseGuildIdList(raw = '') {
    return String(raw)
        .split(/[,;\s]+/)
        .map((id) => id.trim())
        .filter(Boolean);
}

function getIncrementalGuildIds() {
    return parseGuildIdList(process.env.SLASH_INCREMENTAL_GUILD_IDS || '');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withTimeout(promise, timeoutMs, label = 'request') {
    if (!timeoutMs || timeoutMs <= 0) return promise;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`${label} timeout ${timeoutMs}ms`)), timeoutMs);
        })
    ]);
}

async function getGuildCommands(rest, appId, guildId) {
    return rest.get(Routes.applicationGuildCommands(appId, guildId));
}

async function hasCommandName(rest, appId, guildId, name) {
    const list = await getGuildCommands(rest, appId, guildId);
    return list.some((cmd) => cmd.name === name);
}

async function postMissingCommand(rest, appId, guildId, payload, timeoutMs) {
    try {
        await withTimeout(
            rest.post(Routes.applicationGuildCommands(appId, guildId), { body: payload }),
            timeoutMs,
            'POST'
        );
        return true;
    } catch (error) {
        if (error.status === 429) {
            const wait = Math.ceil((error.rawError?.retry_after || 5) * 1000) + 500;
            await sleep(wait);
            return postMissingCommand(rest, appId, guildId, payload, timeoutMs);
        }
        if (/timeout/i.test(error.message || '')) {
            await sleep(2500);
            return hasCommandName(rest, appId, guildId, payload.name);
        }
        if (error.status) {
            console.warn(`⚠️ Slash POST /${payload.name} (${guildId}): HTTP ${error.status} — ${error.message || 'error'}`);
        }
        return false;
    }
}

/**
 * Completa comandos faltantes uno a uno. Tras timeout verifica con GET.
 */
async function registerGuildCommandsIncremental(rest, appId, guildId, commandPayloads, options = {}) {
    const delayMs = options.delayMs ?? DEFAULT_POST_DELAY_MS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
    const maxRounds = options.maxRounds ?? DEFAULT_INCREMENTAL_ROUNDS;
    const batchSize = Math.max(1, options.batchSize ?? 5);
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

    let posted = 0;

    for (let round = 1; round <= maxRounds; round++) {
        const existing = await getGuildCommands(rest, appId, guildId);
        const existingNames = new Set(existing.map((cmd) => cmd.name));
        const pending = commandPayloads.filter((payload) => !existingNames.has(payload.name));

        if (!pending.length) {
            return {
                created: posted,
                updated: 0,
                skipped: commandPayloads.length,
                failed: 0,
                total: existing.length,
                mode: 'incremental'
            };
        }

        console.log(`🔄 Slash guild ${guildId}: ronda ${round}/${maxRounds}, ${pending.length} pendientes...`);
        if (onProgress) onProgress('round', round, `${pending.length} pendientes`);

        for (let i = 0; i < pending.length; i++) {
            const ok = await postMissingCommand(rest, appId, guildId, pending[i], timeoutMs);
            if (ok) posted += 1;
            if (onProgress) onProgress(ok ? 'create' : 'skip', pending[i].name);

            if ((i + 1) % batchSize === 0) await sleep(2000);
            else await sleep(delayMs);
        }

        await sleep(settleMs);
        const mid = await getGuildCommands(rest, appId, guildId);
        console.log(`   → ${mid.length}/${commandPayloads.length} comandos en API`);
        if (onProgress) onProgress('round', round, `${mid.length}/${commandPayloads.length} en API`);
    }

    const finalList = await getGuildCommands(rest, appId, guildId);
    const finalNames = new Set(finalList.map((c) => c.name));
    const failed = commandPayloads.filter((p) => !finalNames.has(p.name)).length;

    return {
        created: posted,
        updated: 0,
        skipped: Math.max(0, commandPayloads.length - failed),
        failed,
        total: finalList.length,
        mode: 'incremental'
    };
}

async function registerGuildCommandsBulk(rest, appId, guildId, commandPayloads, timeoutMs) {
    const result = await withTimeout(
        rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commandPayloads }),
        timeoutMs,
        'PUT'
    );
    const total = Array.isArray(result) ? result.length : commandPayloads.length;
    return { mode: 'bulk', total, failed: 0, created: 0, updated: 0, skipped: 0 };
}

async function registerGuildCommands(rest, appId, guildId, commandPayloads, options = {}) {
    const forceIncremental = options.forceIncremental === true
        || getIncrementalGuildIds().includes(guildId);
    const bulkTimeoutMs = options.bulkTimeoutMs ?? DEFAULT_BULK_TIMEOUT_MS;

    if (!forceIncremental) {
        try {
            const bulk = await registerGuildCommandsBulk(rest, appId, guildId, commandPayloads, bulkTimeoutMs);
            if (bulk.total >= commandPayloads.length) {
                return bulk;
            }
            console.warn(`⚠️ PUT slash devolvió ${bulk.total}/${commandPayloads.length} en guild ${guildId}. Completando...`);
        } catch (error) {
            console.warn(`⚠️ PUT slash falló en guild ${guildId} (${error.message || error}). Completando uno a uno...`);
        }
    }

    return registerGuildCommandsIncremental(rest, appId, guildId, commandPayloads, options);
}

function prioritizeGuildIds(guildIds, primaryGuildId) {
    const unique = Array.from(new Set(guildIds.filter(Boolean)));
    if (!primaryGuildId || !unique.includes(primaryGuildId)) return unique;
    const others = unique.filter((id) => id !== primaryGuildId);
    return [...others, primaryGuildId];
}

module.exports = {
    DEFAULT_POST_DELAY_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
    DEFAULT_BULK_TIMEOUT_MS,
    getIncrementalGuildIds,
    registerGuildCommands,
    registerGuildCommandsBulk,
    registerGuildCommandsIncremental,
    prioritizeGuildIds
};
