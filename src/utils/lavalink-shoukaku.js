const { Shoukaku, Connectors, Constants } = require('shoukaku');
const config = require('../config');

/** @type {Shoukaku | null} */
let shoukaku = null;

function isReady() {
    if (!shoukaku) return false;
    const node = getNode();
    return !!(node && node.state === Constants.State.CONNECTED);
}

function getShoukaku() {
    return shoukaku;
}

function getNode() {
    if (!shoukaku) return null;
    try {
        return shoukaku.options.nodeResolver(shoukaku.nodes);
    } catch {
        return null;
    }
}

/**
 * @param {import('discord.js').Client} client
 */
function initShoukaku(client) {
    if (shoukaku) return shoukaku;

    const host = config.lavalinkHost || '127.0.0.1';
    const port = config.lavalinkPort || 2333;

    shoukaku = new Shoukaku(new Connectors.DiscordJS(client), [
        {
            name: 'main',
            url: `${host}:${port}`,
            auth: config.lavalinkPassword || 'youshallnotpass'
        }
    ], {
        moveOnDisconnect: false,
        resume: false,
        reconnectTries: 8,
        reconnectInterval: 4000,
        restTimeout: 30000
    });

    shoukaku.on('ready', (name) => {
        console.log(`🎵 Lavalink nodo "${name}" listo (Shoukaku)`);
    });

    shoukaku.on('error', (name, error) => {
        console.warn(`⚠️ Lavalink [${name}]:`, error?.message || error);
    });

    shoukaku.on('close', (name, code, reason) => {
        console.warn(`⚠️ Lavalink [${name}] cerrado (${code}): ${reason || ''}`);
    });

    shoukaku.on('disconnect', (name, count) => {
        console.warn(`⚠️ Lavalink [${name}] desconectado (intentos: ${count})`);
    });

    return shoukaku;
}

async function waitForNodeReady(timeoutMs = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (isReady()) return getNode();
        await new Promise((r) => setTimeout(r, 500));
    }
    return null;
}

/**
 * @param {string} identifier
 */
async function resolve(identifier) {
    const node = getNode();
    if (!node) throw new Error('Lavalink no está conectado. Comprueba que el servicio Lavalink esté activo.');
    return node.rest.resolve(identifier);
}

async function destroyShoukaku() {
    if (!shoukaku) return;
    try {
        const ids = [...shoukaku.players.keys()];
        for (const guildId of ids) {
            try {
                await shoukaku.leaveVoiceChannel(guildId);
            } catch {
                /* noop */
            }
        }
    } catch {
        /* noop */
    }
    shoukaku = null;
}

module.exports = {
    initShoukaku,
    getShoukaku,
    getNode,
    isReady,
    waitForNodeReady,
    resolve,
    destroyShoukaku
};
