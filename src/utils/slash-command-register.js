const { Routes } = require('discord.js');

const DEFAULT_POST_DELAY_MS = Math.max(400, Number.parseInt(process.env.SLASH_POST_DELAY_MS || '600', 10));
const DEFAULT_REQUEST_TIMEOUT_MS = Math.max(1500, Number.parseInt(process.env.SLASH_REQUEST_TIMEOUT_MS || '3000', 10));
const DEFAULT_BULK_TIMEOUT_MS = Math.max(15000, Number.parseInt(process.env.SLASH_BULK_TIMEOUT_MS || '90000', 10));
const DEFAULT_SETTLE_MS = Math.max(10000, Number.parseInt(process.env.SLASH_SETTLE_MS || '45000', 10));
const DEFAULT_INCREMENTAL_ROUNDS = Math.max(1, Number.parseInt(process.env.SLASH_INCREMENTAL_ROUNDS || '8', 10));

function parseGuildIdList(raw = '') {
    return String(raw)
        .split(/[,;\s]+/)
        .map((id) => id.trim())
        .filter(Boolean);
}

/** Solo guilds listados en env; GUILD_ID ya no fuerza modo lento (se intenta PUT normal primero). */
function getIncrementalGuildIds() {
    return parseGuildIdList(process.env.SLASH_INCREMENTAL_GUILD_IDS || '');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function commandNeedsSync(current, payload) {
    if (!current) return true;
    const stripMeta = (cmd) => {
        const { id, application_id, version, nsfw, ...rest } = cmd;
        return rest;
    };
    return JSON.stringify(stripMeta(current)) !== JSON.stringify(payload);
}

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

async function postGuildCommand(rest, appId, guildId, body, timeoutMs) {
    return withTimeout(
        rest.post(Routes.applicationGuildCommands(appId, guildId), { body }),
        timeoutMs,
        'POST'
    );
}

async function patchGuildCommand(rest, appId, guildId, commandId, body, timeoutMs) {
    return withTimeout(
        rest.patch(Routes.applicationGuildCommand(appId, guildId, commandId), { body }),
        timeoutMs,
        'PATCH'
    );
}

function fireUpsertCommand(rest, appId, guildId, payload, current) {
    const op = current
        ? rest.patch(Routes.applicationGuildCommand(appId, guildId, current.id), { body: payload })
        : rest.post(Routes.applicationGuildCommands(appId, guildId), { body: payload });

    op.catch((error) => {
        if (error?.status === 429) {
            const wait = Math.ceil((error.rawError?.retry_after || 3) * 1000) + 300;
            setTimeout(() => fireUpsertCommand(rest, appId, guildId, payload, current), wait);
            return;
        }
        if (error?.status) {
            console.warn(`⚠️ Slash ${payload.name} en ${guildId}: HTTP ${error.status} — ${error.message || 'error'}`);
        }
    });
}

/**
 * Completa comandos faltantes en rondas (POST/PATCH corto + pausa + GET).
 * Usado al arrancar cuando el PUT masivo no responde (p. ej. EyedComun).
 */
async function registerGuildCommandsIncremental(rest, appId, guildId, commandPayloads, options = {}) {
    const delayMs = options.delayMs ?? DEFAULT_POST_DELAY_MS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
    const maxRounds = options.maxRounds ?? DEFAULT_INCREMENTAL_ROUNDS;
    const batchSize = Math.max(1, options.batchSize ?? 8);
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

    for (let round = 1; round <= maxRounds; round++) {
        const existing = await getGuildCommands(rest, appId, guildId);
        const existingByName = new Map(existing.map((cmd) => [cmd.name, cmd]));

        const pending = commandPayloads.filter((payload) => !existingByName.has(payload.name));

        if (!pending.length) {
            return { created: 0, updated: 0, skipped: commandPayloads.length, failed: 0, total: existing.length, mode: 'incremental' };
        }

        if (onProgress) onProgress('round', round, `${pending.length} pendientes`);

        console.log(`🔄 Slash guild ${guildId}: ronda ${round}/${maxRounds}, ${pending.length} pendientes...`);

        for (let i = 0; i < pending.length; i++) {
            const payload = pending[i];
            const current = existingByName.get(payload.name);
            await fireUpsertCommand(rest, appId, guildId, payload, current);
            if (onProgress) onProgress(current ? 'update' : 'create', payload.name);

            if ((i + 1) % batchSize === 0) await sleep(1500);
            else await sleep(delayMs);
        }

        await sleep(settleMs);
        if (onProgress) {
            const mid = await getGuildCommands(rest, appId, guildId);
            console.log(`   → ${mid.length}/${commandPayloads.length} comandos en API`);
            onProgress('round', round, `${mid.length}/${commandPayloads.length} en API`);
        }
    }

    const finalList = await getGuildCommands(rest, appId, guildId);
    const finalNames = new Set(finalList.map((c) => c.name));
    const missing = commandPayloads.filter((p) => !finalNames.has(p.name));
    const failed = missing.length;

    if (failed > 0) {
        const err = new Error(`Faltan ${failed} comandos en guild ${guildId}: ${missing.map((c) => c.name).join(', ')}`);
        err.partialStats = { created, updated, skipped: commandPayloads.length - created - updated - failed, failed, total: finalList.length, mode: 'incremental' };
        throw err;
    }

    return { created: finalList.length, updated: 0, skipped: 0, failed: 0, total: finalList.length, mode: 'incremental' };
}

async function registerGuildCommandsBulk(rest, appId, guildId, commandPayloads, timeoutMs) {
    const result = await withTimeout(
        rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commandPayloads }),
        timeoutMs,
        'PUT'
    );
    const total = Array.isArray(result) ? result.length : commandPayloads.length;
    return { mode: 'bulk', total };
}

/**
 * Flujo normal al arrancar: PUT masivo (como otros servidores). Si hace timeout, completa en rondas hasta tener todos.
 */
async function registerGuildCommands(rest, appId, guildId, commandPayloads, options = {}) {
    const forceIncremental = options.forceIncremental === true
        || getIncrementalGuildIds().includes(guildId);
    const bulkTimeoutMs = options.bulkTimeoutMs ?? DEFAULT_BULK_TIMEOUT_MS;
    const onProgress = options.onProgress;

    if (!forceIncremental) {
        try {
            const bulk = await registerGuildCommandsBulk(rest, appId, guildId, commandPayloads, bulkTimeoutMs);
            if (bulk.total >= commandPayloads.length) {
                return bulk;
            }
            console.warn(`⚠️ PUT slash devolvió ${bulk.total}/${commandPayloads.length} en guild ${guildId}. Completando...`);
        } catch (error) {
            console.warn(`⚠️ PUT slash falló en guild ${guildId} (${error.message || error}). Completando en rondas...`);
        }
    } else {
        console.log(`🔄 Registro por rondas en guild ${guildId} (${commandPayloads.length} comandos)...`);
    }

    return registerGuildCommandsIncremental(rest, appId, guildId, commandPayloads, {
        delayMs: options.delayMs,
        timeoutMs: options.timeoutMs,
        settleMs: options.settleMs,
        maxRounds: options.maxRounds,
        batchSize: options.batchSize,
        onProgress
    });
}

function prioritizeGuildIds(guildIds, primaryGuildId) {
    const unique = Array.from(new Set(guildIds.filter(Boolean)));
    if (!primaryGuildId || !unique.includes(primaryGuildId)) return unique;
    return [primaryGuildId, ...unique.filter((id) => id !== primaryGuildId)];
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
