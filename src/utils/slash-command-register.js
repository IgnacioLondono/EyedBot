const { Routes } = require('discord.js');

const DEFAULT_POST_DELAY_MS = Math.max(200, Number.parseInt(process.env.SLASH_POST_DELAY_MS || '350', 10));
const DEFAULT_REQUEST_TIMEOUT_MS = Math.max(3000, Number.parseInt(process.env.SLASH_REQUEST_TIMEOUT_MS || '10000', 10));

function parseGuildIdList(raw = '') {
    return String(raw)
        .split(/[,;\s]+/)
        .map((id) => id.trim())
        .filter(Boolean);
}

function getIncrementalGuildIds() {
    const fromEnv = parseGuildIdList(process.env.SLASH_INCREMENTAL_GUILD_IDS || '');
    const guildId = String(process.env.GUILD_ID || '').trim();
    const forced = parseGuildIdList(process.env.FORCED_SLASH_GUILD_IDS || '');
    return Array.from(new Set([...fromEnv, guildId, ...forced].filter(Boolean)));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function commandPayloadsEqual(a, b) {
    if (!a || !b) return false;
    if (a.name !== b.name) return false;
    return JSON.stringify(a) === JSON.stringify(b);
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

/**
 * Registra comandos uno a uno (POST/PATCH). Tras timeout verifica con GET por si Discord aplicó el cambio sin responder.
 */
async function registerGuildCommandsIncremental(rest, appId, guildId, commandPayloads, options = {}) {
    const delayMs = options.delayMs ?? DEFAULT_POST_DELAY_MS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

    let existing = await getGuildCommands(rest, appId, guildId);
    const existingByName = new Map(existing.map((cmd) => [cmd.name, cmd]));

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const payload of commandPayloads) {
        const current = existingByName.get(payload.name);

        if (current && commandPayloadsEqual(current, payload)) {
            skipped += 1;
            continue;
        }

        let success = false;
        for (let attempt = 1; attempt <= 4 && !success; attempt++) {
            try {
                if (current) {
                    await patchGuildCommand(rest, appId, guildId, current.id, payload, timeoutMs);
                    updated += 1;
                } else {
                    await postGuildCommand(rest, appId, guildId, payload, timeoutMs);
                    created += 1;
                }
                success = true;
            } catch (error) {
                if (error.status === 429) {
                    const wait = Math.ceil((error.rawError?.retry_after || 5) * 1000) + 500;
                    await sleep(wait);
                    continue;
                }

                const timedOut = /timeout/i.test(error.message || '');
                if (timedOut) {
                    await sleep(2000);
                    existing = await getGuildCommands(rest, appId, guildId);
                    existingByName.clear();
                    for (const cmd of existing) existingByName.set(cmd.name, cmd);
                    const after = existingByName.get(payload.name);
                    if (after) {
                        if (!current) created += 1;
                        else if (!commandPayloadsEqual(current, payload)) updated += 1;
                        else skipped += 1;
                        success = true;
                        break;
                    }
                }

                if (attempt === 4) {
                    failed += 1;
                    if (onProgress) onProgress('error', payload.name, error.message || error);
                } else {
                    await sleep(1500);
                }
            }
        }

        if (success && onProgress) {
            onProgress(current ? 'update' : 'create', payload.name);
        }

        if (success) await sleep(delayMs);
    }

    const finalList = await getGuildCommands(rest, appId, guildId);
    return { created, updated, skipped, failed, total: finalList.length };
}

async function registerGuildCommandsBulk(rest, appId, guildId, commandPayloads, timeoutMs) {
    const result = await withTimeout(
        rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commandPayloads }),
        timeoutMs,
        'PUT'
    );
    return { mode: 'bulk', total: Array.isArray(result) ? result.length : commandPayloads.length };
}

/**
 * PUT masivo por defecto; guilds lentos (GUILD_ID / SLASH_INCREMENTAL_GUILD_IDS) usan POST incremental.
 * Si PUT falla o hace timeout, reintenta incremental en ese guild.
 */
async function registerGuildCommands(rest, appId, guildId, commandPayloads, options = {}) {
    const incrementalGuildIds = options.incrementalGuildIds ?? getIncrementalGuildIds();
    const perGuildTimeoutMs = options.perGuildTimeoutMs ?? 0;
    const forceIncremental = options.forceIncremental === true || incrementalGuildIds.includes(guildId);
    const onProgress = options.onProgress;

    if (!forceIncremental && perGuildTimeoutMs !== 0) {
        try {
            return await registerGuildCommandsBulk(rest, appId, guildId, commandPayloads, perGuildTimeoutMs);
        } catch (error) {
            console.warn(`⚠️ PUT slash falló en guild ${guildId} (${error.message || error}). Usando registro incremental...`);
        }
    } else if (!forceIncremental) {
        try {
            return await registerGuildCommandsBulk(rest, appId, guildId, commandPayloads, 0);
        } catch (error) {
            console.warn(`⚠️ PUT slash falló en guild ${guildId} (${error.message || error}). Usando registro incremental...`);
        }
    }

    const stats = await registerGuildCommandsIncremental(rest, appId, guildId, commandPayloads, {
        delayMs: options.delayMs,
        timeoutMs: options.timeoutMs,
        onProgress
    });

    return { mode: 'incremental', ...stats };
}

function prioritizeGuildIds(guildIds, primaryGuildId) {
    const unique = Array.from(new Set(guildIds.filter(Boolean)));
    if (!primaryGuildId || !unique.includes(primaryGuildId)) return unique;
    return [primaryGuildId, ...unique.filter((id) => id !== primaryGuildId)];
}

module.exports = {
    DEFAULT_POST_DELAY_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
    getIncrementalGuildIds,
    registerGuildCommands,
    registerGuildCommandsBulk,
    registerGuildCommandsIncremental,
    prioritizeGuildIds
};
