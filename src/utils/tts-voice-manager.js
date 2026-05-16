const fs = require('fs');
const { createReadStream } = require('node:fs');
const db = require('./database');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    entersState,
    VoiceConnectionStatus,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    getVoiceConnection
} = require('@discordjs/voice');
const { textToMp3TempFiles } = require('./tts-google-gtx');

/** @typedef {{ connection: import('@discordjs/voice').VoiceConnection, player: import('@discordjs/voice').AudioPlayer, queue: string[], processing: boolean, lang: string, idleTimer?: NodeJS.Timeout | null, listenChannelId: string }} TtsGuildSession */

/** @type {Map<string, TtsGuildSession>} */
const sessions = new Map();

/** Preferencia de idioma antes de tener sesión activa */
/** @type {Map<string, string>} */
const guildPendingLang = new Map();

/** Canal de texto donde leer mensajes antes de tener sesión o para aplicar en el próximo unir */
/** @type {Map<string, string>} */
const guildPendingListenChannel = new Map();

/** @type {Map<string, { prefix: string, at: number }>} */
const guildPrefixCache = new Map();

const MAX_QUEUE = 14;
const IDLE_MS = Number.parseInt(process.env.TTS_IDLE_DISCONNECT_MS || '180000', 10);
const READ_CHAT = (process.env.TTS_READ_CHAT || 'true').toLowerCase() !== 'false';
const READ_SKIP_PREFIX = (process.env.TTS_READ_SKIP_PREFIX || 'true').toLowerCase() !== 'false';

const READ_MAX_CHARS = Math.min(
    900,
    Math.max(40, Number.parseInt(process.env.TTS_READ_MAX_CHARS || '400', 10) || 400)
);

function envTtsEnabled() {
    return (process.env.TTS_ENABLED || 'true').toLowerCase() !== 'false';
}

function defaultLang() {
    return String(process.env.TTS_DEFAULT_LANG || 'es').trim().slice(0, 12) || 'es';
}

function ensureFfmpegPath() {
    try {
        const ffmpegStatic = require('ffmpeg-static');
        if (ffmpegStatic && typeof ffmpegStatic === 'string') {
            process.env.FFMPEG_PATH = ffmpegStatic;
        }
    } catch {
        /* noop */
    }
}

function normalizeSpeakLine(raw) {
    return String(raw || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function sanitizeDiscordPlaintext(raw) {
    let t = String(raw || '');
    t = t.replace(/<@!?[0-9]+>/g, ' ');
    t = t.replace(/<@&[0-9]+>/g, ' ');
    t = t.replace(/<#[0-9]+>/g, ' ');
    t = t.replace(/<a?:[\w~]+:[0-9]+>/gi, ' ');
    t = t.replace(/https?:\/\/[^\s<]+/gi, ' ');
    return t;
}

function prepareChatLineForTts(raw) {
    let t = sanitizeDiscordPlaintext(raw);
    t = normalizeSpeakLine(t);
    if (!t.length) return '';
    if (t.length > READ_MAX_CHARS) return t.slice(0, READ_MAX_CHARS);
    return t;
}

/**
 * @param {string} guildId
 */
async function getCachedGuildPrefix(guildId) {
    const gid = String(guildId || '');
    const fallback = String(process.env.DEFAULT_PREFIX || '!').trim().slice(0, 5) || '!';
    if (!gid) return fallback;

    const now = Date.now();
    const cached = guildPrefixCache.get(gid);
    if (cached && now - cached.at < 60_000) return cached.prefix;

    let prefix = fallback;
    try {
        const v = await db.get(`prefix_${gid}`);
        prefix = String(v ?? process.env.DEFAULT_PREFIX ?? '!')
            .trim()
            .slice(0, 5) || fallback;
    } catch {
        prefix = fallback;
    }
    guildPrefixCache.set(gid, { prefix, at: now });
    return prefix;
}

/**
 * @param {import('discord.js').Message} message
 * @param {string} listenChannelId
 */
function messageMatchesListenChannel(message, listenChannelId) {
    const listen = String(listenChannelId || '');
    if (!listen) return false;
    if (message.channelId === listen) return true;
    const ch = message.channel;
    if (ch && typeof ch.isThread === 'function' && ch.isThread() && ch.parentId === listen) return true;
    return false;
}

/**
 * Canal de texto a escuchar tras /tts unir o /tts escuchar (pendiente se consume al unir de nuevo si aplica).
 * @returns {string}
 */
function resolveListenChannelIdFromInteraction(interaction) {
    const gid = interaction.guildId;
    const chosen = guildPendingListenChannel.get(gid) || interaction.channelId;
    guildPendingListenChannel.delete(gid);
    return String(chosen || '');
}

/**
 * Fija el canal de texto donde se leen mensajes (sesión actual o pendiente para el próximo unir).
 * @param {string} guildId
 * @param {string} channelId
 */
function setGuildListenChannel(guildId, channelId) {
    const gid = String(guildId || '');
    const cid = String(channelId || '');
    if (!gid || !cid) return false;
    guildPendingListenChannel.set(gid, cid);
    const s = sessions.get(gid);
    if (s) s.listenChannelId = cid;
    return true;
}

function destroyGuildSession(guildId, reason = '') {
    const id = String(guildId || '');
    const s = sessions.get(id);
    if (!s) return;
    sessions.delete(id);

    try {
        if (s.idleTimer) clearTimeout(s.idleTimer);
    } catch {
        /* noop */
    }

    try {
        s.player.stop(true);
    } catch {
        /* noop */
    }

    try {
        s.connection.destroy();
    } catch {
        /* noop */
    }

    if (reason) {
        console.log(`🔈 TTS: sesión cerrada en guild ${id} (${reason})`);
    }
}

function disconnectAll(reason = 'shutdown') {
    const ids = [...sessions.keys()];
    for (const id of ids) {
        destroyGuildSession(id, reason);
    }
}

function resetIdleTimer(guildId) {
    const id = String(guildId || '');
    const s = sessions.get(id);
    if (!s || !Number.isFinite(IDLE_MS) || IDLE_MS <= 0) return;

    try {
        if (s.idleTimer) clearTimeout(s.idleTimer);
    } catch {
        /* noop */
    }

    if (s.queue.length === 0 && !s.processing) {
        s.idleTimer = setTimeout(() => {
            const cur = sessions.get(id);
            if (cur?.queue?.length === 0 && !cur.processing) {
                destroyGuildSession(id, 'inactividad');
            }
        }, IDLE_MS);
    } else {
        s.idleTimer = null;
    }
}

/**
 * @param {string} guildId
 * @param {TtsGuildSession} s
 * @returns {Promise<void>}
 */
async function playOneMp3Path(s, filepath) {
    ensureFfmpegPath();
    const stream = createReadStream(filepath);
    const resource = createAudioResource(stream);

    try {
        s.player.play(resource);
        await entersState(s.player, AudioPlayerStatus.Idle, 480_000);
    } finally {
        try {
            stream.destroy();
        } catch {
            /* noop */
        }
    }
}

async function drainQueue(guildId) {
    const id = String(guildId || '');
    const s = sessions.get(id);
    if (!s || s.processing) return;

    s.processing = true;

    try {
        while (s.queue.length && sessions.has(id)) {
            const line = s.queue.shift();
            if (!String(line || '').trim()) continue;

            let files = [];
            try {
                files = await textToMp3TempFiles(line, s.lang);
                for (const f of files) {
                    await playOneMp3Path(s, f).catch(() => null);
                }
            } catch (e) {
                console.warn('⚠️ TTS sintetizar/reproducir:', e.message || e);
            } finally {
                for (const f of files) {
                    fs.unlink(f, () => null);
                }
            }
        }
    } finally {
        const alive = sessions.get(id);
        if (alive) {
            alive.processing = false;
            resetIdleTimer(id);
        }
    }
}

/**
 * Unir EyedBot al canal de voz del miembro y preparar sesión TTS (sin cola).
 */
async function joinSession(interaction) {
    ensureFfmpegPath();
    const guild = interaction.guild;
    const member = interaction.member;
    const vc = member?.voice?.channel;

    if (!guild || !member || !vc) {
        return { ok: false, reason: 'no_voice' };
    }

    /** @type {import('discord.js').GuildChannel} */
    const ch = vc;
    const guildId = guild.id;

    if (sessions.has(guildId)) {
        const curVc = interaction.client.guilds.cache.get(guildId)?.members?.me?.voice?.channelId;
        if (curVc === ch.id) {
            const sess = sessions.get(guildId);
            if (sess) sess.listenChannelId = resolveListenChannelIdFromInteraction(interaction);
            return { ok: true, reason: 'ya_conectado' };
        }
        destroyGuildSession(guildId, 'reemplazo');
    }

    const vcConn = getVoiceConnection(guildId);
    if (vcConn) {
        return { ok: false, reason: 'voz_ocupada' };
    }

    const me = guild.members.me;
    const perms = ch.permissionsFor(me);
    if (!perms?.has(['Connect', 'Speak'])) {
        return { ok: false, reason: 'sin_permiso' };
    }

    const connection = joinVoiceChannel({
        channelId: ch.id,
        guildId,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
    });

    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 25_000);
    } catch (e) {
        try {
            connection.destroy();
        } catch {
            /* noop */
        }
        return { ok: false, reason: 'fallo_red', detail: String(e.message || e) };
    }

    const player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Pause }
    });

    connection.subscribe(player);

    player.on('error', (err) => {
        console.warn('⚠️ TTS AudioPlayer error:', err?.message || err);
    });

    connection.on('error', (err) => {
        console.warn('⚠️ TTS VoiceConnection error:', err?.message || err);
    });

    const listenChannelId = resolveListenChannelIdFromInteraction(interaction);

    sessions.set(guildId, {
        connection,
        player,
        queue: [],
        processing: false,
        lang: guildPendingLang.get(guildId) || defaultLang(),
        idleTimer: null,
        listenChannelId
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 3_500),
                entersState(connection, VoiceConnectionStatus.Connecting, 3_500)
            ]);
        } catch {
            destroyGuildSession(guildId, 'desconexion');
        }
    });

    return { ok: true, reason: 'ok' };
}

function leaveGuild(guildId) {
    destroyGuildSession(String(guildId || ''), 'salir_manual');
}

/**
 * Encola texto cuando ya hay sesión TTS activa.
 * @param {string} guildId
 * @param {string} text
 * @param {{ fromChat?: boolean }} [opts]
 */
async function enqueueTextForGuild(guildId, text, opts = {}) {
    const gid = String(guildId || '');
    const q = sessions.get(gid);
    if (!q) return { ok: false, reason: 'no_sesion' };

    const line = opts.fromChat ? prepareChatLineForTts(text) : normalizeSpeakLine(text);
    if (!line.length) return { ok: false, reason: 'vacio' };

    if (q.queue.length >= MAX_QUEUE) {
        return { ok: false, reason: 'cola_llena' };
    }

    q.queue.push(line);
    resetIdleTimer(gid);
    drainQueue(gid).catch((e) => console.warn('TTS drain:', e));

    return { ok: true, reason: 'ok', queueLength: q.queue.length };
}

/**
 * Encola texto para hablar por voz en el servidor.
 */
async function enqueueSpeak(interaction, text) {
    const guild = interaction.guild;
    const guildId = guild?.id;
    if (!guildId) return { ok: false, reason: 'no_guild' };

    let s = sessions.get(guildId);
    if (!s) {
        const joined = await joinSession(interaction);
        if (!joined.ok) return joined;
        s = sessions.get(guildId);
    }

    return enqueueTextForGuild(guildId, text, { fromChat: false });
}

function clearQueue(interaction) {
    const guildId = interaction.guild?.id;
    const q = guildId ? sessions.get(guildId) : null;
    if (!q) return false;
    q.queue.length = 0;
    try {
        q.player.stop(true);
    } catch {
        /* noop */
    }
    resetIdleTimer(guildId);
    return true;
}

function setGuildLang(guildId, lang) {
    const gid = String(guildId || '');
    const lc = String(lang || 'es').trim().slice(0, 12) || 'es';
    guildPendingLang.set(gid, lc);
    const q = sessions.get(gid);
    if (q) {
        q.lang = lc;
    }
    return true;
}

function resolveLangForGuild(guildId) {
    return guildPendingLang.get(String(guildId)) || sessions.get(String(guildId))?.lang || defaultLang();
}

function getGuildLang(guildId) {
    return resolveLangForGuild(String(guildId || ''));
}

/** Si en el canal de voz de la sesión TTS no queda ningún usuario humano, cerrar al instante. */
function disconnectTtsIfVoiceChannelEmpty(guild) {
    const gid = guild?.id;
    const s = gid ? sessions.get(gid) : undefined;
    if (!s) return;

    const chId = s.connection?.joinConfig?.channelId;
    if (!chId) return;

    const vc = guild.channels.cache.get(chId);
    if (!vc || typeof vc.isVoiceBased !== 'function' || !vc.isVoiceBased()) {
        destroyGuildSession(gid, 'canal_vc_invalido');
        return;
    }

    let humanCount = 0;
    try {
        humanCount = [...vc.members.values()].filter((m) => m.user && !m.user.bot).length;
    } catch {
        return;
    }

    if (humanCount === 0) {
        destroyGuildSession(gid, 'canal_sin_humanos');
    }
}

/** Listeners: bot kicked from VC y lectura de chat → TTS */
function attachCleanupListeners(client) {
    client.on('voiceStateUpdate', (oldState, newState) => {
        const guild = newState.guild;

        /* El propio bot se fue del canal (kick, mover, etc.): limpiar sesión TTS */
        if (oldState.memberId === client.user?.id && oldState.channelId && !newState.channelId) {
            if (sessions.has(guild.id)) destroyGuildSession(guild.id, 'bot_desconectado');
            return;
        }

        /* Cualquier cambio de voz en el servidor: si el canal TTS quedó sin humanos, desconectar ya */
        disconnectTtsIfVoiceChannelEmpty(guild);
    });

    if (READ_CHAT) {
        client.on('messageCreate', (message) => {
            if (!message.guild || message.author.bot) return;
            if (message.webhookId) return;
            if (!String(message.content || '').trim()) return;

            const gid = message.guildId;
            const s = sessions.get(gid);
            if (!s?.listenChannelId) return;
            if (!messageMatchesListenChannel(message, s.listenChannelId)) return;

            Promise.resolve()
                .then(async () => {
                    if (READ_SKIP_PREFIX) {
                        const prefix = await getCachedGuildPrefix(gid);
                        if (prefix && message.content.startsWith(prefix)) return;
                    }
                    await enqueueTextForGuild(gid, message.content, { fromChat: true });
                })
                .catch((e) => console.warn('TTS messageCreate:', e?.message || e));
        });
    }
}

module.exports = {
    envTtsEnabled,
    joinSession,
    leaveGuild,
    enqueueSpeak,
    enqueueTextForGuild,
    clearQueue,
    setGuildLang,
    setGuildListenChannel,
    getGuildLang,
    attachCleanupListeners,
    destroyGuildSession,
    disconnectAll,
    sessions
};
