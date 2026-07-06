const http = require('http');
const { Shoukaku, Connectors, Constants } = require('shoukaku');
const config = require('../config');

const READY_TIMEOUT_MS = Math.max(
    15000,
    Number.parseInt(process.env.LAVALINK_READY_TIMEOUT_MS || '120000', 10) || 120000
);
const HTTP_WARMUP_MS = Math.max(
    5000,
    Number.parseInt(process.env.LAVALINK_HTTP_WARMUP_MS || '180000', 10) || 180000
);

function lavalinkConnectionHint() {
    const host = config.lavalinkHost || '127.0.0.1';
    const port = config.lavalinkPort || 2333;
    const hasPassword = Boolean(String(config.lavalinkPassword || '').trim());
    const lines = [
        `Destino: ${host}:${port}`,
        `LAVALINK_PASSWORD en bot: ${hasPassword ? 'definida' : 'vacía (usa default youshallnotpass)'}`,
        'Comprueba en Portainer:',
        '  1) Contenedor eyedbot-lavalink en Running (requiere COMPOSE_PROFILES=music en el stack)',
        '  2) MUSIC_ENABLED=true y LAVALINK_ENABLED=true',
        '  3) Host mode → LAVALINK_HOST=127.0.0.1 (no "lavalink")',
        '  4) Misma LAVALINK_PASSWORD en bot y lavalink',
        '  5) Primer arranque: el plugin YouTube puede tardar 2–3 min (revisa logs de eyedbot-lavalink)'
    ];
    return lines.join('\n   ');
}

/** @type {Shoukaku | null} */
let shoukaku = null;
/** @type {((ready: boolean) => void) | null} */
let readyCallback = null;

function nodeStateLabel(state) {
    if (state === Constants.State.CONNECTED) return 'CONNECTED';
    if (state === Constants.State.CONNECTING) return 'CONNECTING';
    if (state === Constants.State.DISCONNECTING) return 'DISCONNECTING';
    if (state === Constants.State.DISCONNECTED) return 'DISCONNECTED';
    return String(state ?? 'unknown');
}

function logNodeSnapshot(context) {
    if (!shoukaku?.nodes?.size) {
        console.warn(`⚠️ Lavalink (${context}): sin nodos en Shoukaku (¿initShoukaku antes de login?).`);
        return;
    }
    for (const [name, node] of shoukaku.nodes) {
        console.warn(`⚠️ Lavalink (${context}) nodo "${name}": ${nodeStateLabel(node.state)} → ${node.url || '?'}`);
    }
}

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
 * Espera a que Lavalink responda HTTP (plugin YouTube puede tardar en el primer arranque).
 */
function waitForLavalinkHttp(timeoutMs = HTTP_WARMUP_MS) {
    const host = config.lavalinkHost || '127.0.0.1';
    const port = config.lavalinkPort || 2333;
    const password = config.lavalinkPassword || 'youshallnotpass';
    const started = Date.now();
    let authWarned = false;

    return new Promise((resolve) => {
        const attempt = () => {
            if (Date.now() - started >= timeoutMs) {
                resolve(false);
                return;
            }

            const req = http.request(
                {
                    host,
                    port,
                    path: '/version',
                    method: 'GET',
                    headers: { Authorization: password },
                    timeout: 4000
                },
                (res) => {
                    res.resume();
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(true);
                        return;
                    }
                    if (res.statusCode === 401 && !authWarned) {
                        authWarned = true;
                        console.warn('⚠️ Lavalink rechazó la contraseña (401). LAVALINK_PASSWORD del bot debe coincidir con LAVALINK_SERVER_PASSWORD de Lavalink.');
                    }
                    setTimeout(attempt, 2000);
                }
            );

            req.on('timeout', () => {
                req.destroy();
                setTimeout(attempt, 2000);
            });
            req.on('error', () => setTimeout(attempt, 2000));
            req.end();
        };

        attempt();
    });
}

function buildNodeConfig() {
    const host = config.lavalinkHost || '127.0.0.1';
    const port = config.lavalinkPort || 2333;
    return {
        name: 'main',
        url: `${host}:${port}`,
        auth: config.lavalinkPassword || 'youshallnotpass'
    };
}

function attachShoukakuEventHandlers(instance) {
    instance.on('ready', (name) => {
        console.log(`🎵 Lavalink nodo "${name}" listo (Shoukaku)`);
        if (readyCallback) readyCallback(true);
    });

    instance.on('error', (name, error) => {
        console.warn(`⚠️ Lavalink [${name}]:`, error?.message || error);
    });

    instance.on('close', (name, code, reason) => {
        console.warn(`⚠️ Lavalink [${name}] cerrado (${code}): ${reason || ''}`);
    });

    instance.on('disconnect', (name, count) => {
        console.warn(`⚠️ Lavalink [${name}] desconectado (intentos: ${count})`);
    });

    instance.on('debug', (name, message) => {
        if (String(process.env.LAVALINK_DEBUG || '').toLowerCase() === 'true') {
            console.log(`🎵 Lavalink debug [${name}]:`, message);
        }
    });
}

/**
 * Debe llamarse antes de client.login() para que el conector DiscordJS registre clientReady.
 * Si el cliente ya está listo, añade el nodo manualmente (clientReady no se repetirá).
 * @param {import('discord.js').Client} client
 */
function initShoukaku(client) {
    if (shoukaku) return shoukaku;

    const nodeConfig = buildNodeConfig();

    shoukaku = new Shoukaku(new Connectors.DiscordJS(client), [nodeConfig], {
        moveOnDisconnect: false,
        resume: false,
        reconnectTries: 12,
        reconnectInterval: 5000,
        restTimeout: 30000
    });

    attachShoukakuEventHandlers(shoukaku);

    if (typeof client.isReady === 'function' && client.isReady() && shoukaku.nodes.size === 0) {
        console.log('🎵 Shoukaku: cliente ya listo; conectando nodo Lavalink manualmente...');
        shoukaku.addNode(nodeConfig);
    }

    return shoukaku;
}

/**
 * @param {number} [timeoutMs]
 */
function waitForNodeReady(timeoutMs = READY_TIMEOUT_MS) {
    const ms = timeoutMs;

    return new Promise((resolve) => {
        if (isReady()) {
            resolve(getNode());
            return;
        }

        if (!shoukaku) {
            resolve(null);
            return;
        }

        let settled = false;
        const finish = (node) => {
            if (settled) return;
            settled = true;
            shoukaku?.off('ready', onReady);
            clearInterval(poll);
            clearTimeout(hardTimeout);
            resolve(node);
        };

        const onReady = () => {
            if (isReady()) finish(getNode());
        };

        shoukaku.on('ready', onReady);

        const poll = setInterval(() => {
            if (isReady()) finish(getNode());
        }, 750);

        const hardTimeout = setTimeout(() => {
            finish(isReady() ? getNode() : null);
        }, ms);
        hardTimeout.unref?.();
    });
}

/**
 * Arranque completo: HTTP de Lavalink + conexión Shoukaku.
 * @param {import('discord.js').Client} client
 */
async function bootstrapMusicConnection(client) {
    console.log(`🎵 Esperando API HTTP de Lavalink en ${config.lavalinkHost}:${config.lavalinkPort} (hasta ${Math.round(HTTP_WARMUP_MS / 1000)}s)...`);
    const httpUp = await waitForLavalinkHttp(HTTP_WARMUP_MS);
    if (!httpUp) {
        console.warn('⚠️ Lavalink HTTP no respondió a tiempo (¿contenedor eyedbot-lavalink caído o plugin descargando?).');
        console.warn(`   ${lavalinkConnectionHint()}`);
        logNodeSnapshot('sin HTTP');
    } else {
        console.log('🎵 Lavalink HTTP activo; conectando Shoukaku...');
    }

    initShoukaku(client);

    const node = await waitForNodeReady(READY_TIMEOUT_MS);
    if (node) return node;

    logNodeSnapshot('timeout Shoukaku');
    console.warn(`   ${lavalinkConnectionHint()}`);
    return null;
}

/**
 * Sigue intentando en segundo plano y avisa cuando conecte.
 * @param {(ok: boolean) => void} [onReady]
 */
function startNodeReadyMonitor(onReady) {
    readyCallback = onReady || null;
    if (isReady()) {
        onReady?.(true);
        return;
    }

    const monitor = setInterval(() => {
        if (isReady()) {
            clearInterval(monitor);
            console.log('🎵 Lavalink conectado (reintento en segundo plano).');
            readyCallback?.(true);
        }
    }, 5000);
    monitor.unref?.();

    setTimeout(() => clearInterval(monitor), 10 * 60 * 1000).unref?.();
}

/**
 * @param {number} [timeoutMs]
 */
async function ensureNodeReady(timeoutMs = 12000) {
    if (isReady()) return getNode();
    return waitForNodeReady(timeoutMs);
}

/**
 * @param {string} identifier
 */
async function resolve(identifier) {
    const node = (await ensureNodeReady(15000)) || getNode();
    if (!node) {
        throw new Error(
            'Lavalink no está conectado. Revisa `docker-compose logs lavalink` y que LAVALINK_HOST apunte al servicio correcto.'
        );
    }
    return node.rest.resolve(identifier);
}

async function destroyShoukaku() {
    readyCallback = null;
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
    waitForLavalinkHttp,
    bootstrapMusicConnection,
    startNodeReadyMonitor,
    ensureNodeReady,
    resolve,
    destroyShoukaku,
    READY_TIMEOUT_MS
};
