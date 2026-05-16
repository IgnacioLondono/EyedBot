const fs = require('fs');
const { createReadStream } = require('node:fs');
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

/** @typedef {{ connection: import('@discordjs/voice').VoiceConnection, player: import('@discordjs/voice').AudioPlayer, queue: string[], processing: boolean, lang: string, idleTimer?: NodeJS.Timeout | null }} TtsGuildSession */

/** @type {Map<string, TtsGuildSession>} */
const sessions = new Map();

/** Preferencia de idioma antes de tener sesión activa */
/** @type {Map<string, string>} */
const guildPendingLang = new Map();

const MAX_QUEUE = 14;
const IDLE_MS = Number.parseInt(process.env.TTS_IDLE_DISCONNECT_MS || '180000', 10);

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

    sessions.set(guildId, {
        connection,
        player,
        queue: [],
        processing: false,
        lang: guildPendingLang.get(guildId) || defaultLang(),
        idleTimer: null
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

    const line = String(text || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (!line.length) return { ok: false, reason: 'vacio' };

    const q = sessions.get(guildId);
    if (!q) return { ok: false, reason: 'no_sesion' };

    if (q.queue.length >= MAX_QUEUE) {
        return { ok: false, reason: 'cola_llena' };
    }

    q.queue.push(line);
    resetIdleTimer(guildId);
    drainQueue(guildId).catch((e) => console.warn('TTS drain:', e));

    return { ok: true, reason: 'ok', queueLength: q.queue.length };
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

/** Listeners: bot kicked from VC */
function attachCleanupListeners(client) {
    client.on('voiceStateUpdate', (oldState, newState) => {
        if (oldState.memberId !== client.user?.id) return;

        /* Bot disconnected from any channel → limpiar TTS sólo si era nuestra sesión conocida */
        if (oldState.channelId && !newState.channelId) {
            const gid = oldState.guild.id;
            if (sessions.has(gid)) destroyGuildSession(gid, 'bot_desconectado');
        }
    });
}

module.exports = {
    envTtsEnabled,
    joinSession,
    leaveGuild,
    enqueueSpeak,
    clearQueue,
    setGuildLang,
    getGuildLang,
    attachCleanupListeners,
    destroyGuildSession,
    disconnectAll,
    sessions
};
