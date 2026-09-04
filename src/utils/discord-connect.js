'use strict';

const dns = require('dns').promises;

const TRANSIENT_CODES = new Set([
    'EAI_AGAIN',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'EHOSTUNREACH',
    'ENETUNREACH'
]);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientNetworkError(error) {
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || error || '');
    if (TRANSIENT_CODES.has(code)) return true;
    return /getaddrinfo|EAI_AGAIN|ENOTFOUND|ETIMEDOUT|network|socket hang up|fetch failed/i.test(message);
}

/**
 * Espera a que discord.com (u otro host) resuelva por DNS.
 * Útil tras cortes de luz: el contenedor suele arrancar antes que el router/DNS.
 */
async function waitForDns(hostname = 'discord.com', { attempts = 45, delayMs = 2000 } = {}) {
    const host = String(hostname || 'discord.com').trim() || 'discord.com';
    for (let i = 1; i <= attempts; i++) {
        try {
            const records = await dns.lookup(host, { all: true });
            if (records?.length) {
                if (i > 1) console.log(`✅ DNS listo: ${host}`);
                return true;
            }
        } catch (error) {
            const code = error?.code || error?.message || error;
            console.warn(`⏳ DNS no listo (${host}): ${code}. Intento ${i}/${attempts}...`);
        }
        await sleep(delayMs);
    }
    console.warn(`⚠️ DNS sigue fallando para ${host}; se continúa con reintentos de login.`);
    return false;
}

/**
 * client.login con reintentos ante fallos transitorios de red/DNS.
 */
async function loginWithRetry(client, token, options = {}) {
    const label = options.label || 'Discord';
    const attempts = Math.max(1, Number(options.attempts) || 24);
    const baseDelayMs = Math.max(500, Number(options.baseDelayMs) || 2500);

    let lastError;
    for (let i = 1; i <= attempts; i++) {
        try {
            await client.login(token);
            return;
        } catch (error) {
            lastError = error;
            if (!isTransientNetworkError(error) || i === attempts) {
                throw error;
            }
            const delay = Math.min(30000, baseDelayMs * Math.min(i, 10));
            const detail = error?.code || error?.message || error;
            console.warn(`⚠️ ${label}: red/DNS no lista (${detail}). Reintento ${i}/${attempts} en ${Math.round(delay / 1000)}s...`);
            await sleep(delay);
        }
    }
    throw lastError;
}

module.exports = {
    waitForDns,
    loginWithRetry,
    isTransientNetworkError
};
