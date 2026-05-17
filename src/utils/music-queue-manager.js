const { EventEmitter } = require('events');
const config = require('../config');
const { QueueRepeatMode, GuildQueueEvent } = require('./music-repeat-modes');
const { trackFromLavalink, buildResolveIdentifier, formatMs, isHttpUrl } = require('./music-track-utils');
const lavalink = require('./lavalink-shoukaku');

/** @type {Map<string, GuildMusicQueue>} */
const queues = new Map();

/** @type {import('discord.js').Client | null} */
let discordClient = null;

/** @type {EventEmitter | null} */
let playerEvents = null;

function percentToLavalinkVolume(percent) {
    const p = Math.max(0, Math.min(config.musicMaxVolume || 80, Number(percent) || 0));
    return Math.round((p / 100) * 1000);
}

function lavalinkVolumeToPercent(lavalinkVol) {
    return Math.round((Number(lavalinkVol) || 0) / 10);
}

class TrackCollection {
    constructor() {
        /** @type {object[]} */
        this._items = [];
    }

    get size() {
        return this._items.length;
    }

    toArray() {
        return [...this._items];
    }

    at(index) {
        return this._items[index] ?? null;
    }

    push(...tracks) {
        for (const t of tracks) if (t) this._items.push(t);
    }

    shift() {
        return this._items.shift() ?? null;
    }

    unshift(track) {
        if (track) this._items.unshift(track);
    }

    clear() {
        this._items = [];
    }

    shuffle() {
        for (let i = this._items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this._items[i], this._items[j]] = [this._items[j], this._items[i]];
        }
    }

    removeTrack(index) {
        if (index < 0 || index >= this._items.length) return;
        this._items.splice(index, 1);
    }

    moveTrack(from, to) {
        if (from < 0 || from >= this._items.length) return;
        if (to < 0 || to >= this._items.length) return;
        const [item] = this._items.splice(from, 1);
        this._items.splice(to, 0, item);
    }

    swapTracks(a, b) {
        if (a < 0 || b < 0 || a >= this._items.length || b >= this._items.length) return;
        [this._items[a], this._items[b]] = [this._items[b], this._items[a]];
    }
}

class LavalinkFilterAdapter {
    /** @param {GuildMusicQueue} queue */
    constructor(queue) {
        this.queue = queue;
        this._enabled = new Set();
    }

    async setFilters(filters) {
        const player = this.queue.getPlayer();
        if (!player) return;
        const list = Array.isArray(filters) ? filters : [];
        if (!list.length) {
            await player.clearFilters().catch(() => null);
            this._enabled.clear();
            return;
        }
        const preset = String(list[0] || '').toLowerCase();
        if (preset.includes('bass')) {
            await player.setFilters({
                equalizer: [
                    { band: 0, gain: 0.15 },
                    { band: 1, gain: 0.12 },
                    { band: 2, gain: 0.08 }
                ]
            }).catch(() => null);
        } else {
            await player.clearFilters().catch(() => null);
        }
    }

    async toggle(name) {
        const n = String(name || '').toLowerCase();
        if (this._enabled.has(n)) {
            this._enabled.delete(n);
            await this.setFilters([]);
            return false;
        }
        this._enabled.add(n);
        if (n === 'nightcore') {
            const player = this.queue.getPlayer();
            await player?.setFilters({ timescale: { speed: 1.25, pitch: 1.2, rate: 1 } }).catch(() => null);
        } else if (n === 'vaporwave') {
            const player = this.queue.getPlayer();
            await player?.setFilters({ timescale: { speed: 0.85, pitch: 0.85, rate: 1 } }).catch(() => null);
        } else {
            await this.setFilters([n]);
        }
        return true;
    }

    isEnabled(name) {
        return this._enabled.has(String(name || '').toLowerCase());
    }
}

class QueueNodeController {
    /** @param {GuildMusicQueue} queue */
    constructor(queue) {
        this.queue = queue;
    }

    get volume() {
        return this.queue._volumePercent;
    }

    isPaused() {
        return this.queue._paused;
    }

    async pause() {
        const player = this.queue.getPlayer();
        if (!player) return;
        this.queue._paused = true;
        await player.setPaused(true).catch(() => null);
        playerEvents?.emit(GuildQueueEvent.PlayerPause, this.queue);
    }

    async resume() {
        const player = this.queue.getPlayer();
        if (!player) return;
        this.queue._paused = false;
        await player.setPaused(false).catch(() => null);
        playerEvents?.emit(GuildQueueEvent.PlayerResume, this.queue);
    }

    skip() {
        void this.queue.skipCurrent();
    }

    async setVolume(percent) {
        const player = this.queue.getPlayer();
        const p = Math.max(0, Math.min(config.musicMaxVolume || 80, Number(percent) || 0));
        this.queue._volumePercent = p;
        if (!player) return;
        await player.setGlobalVolume(percentToLavalinkVolume(p)).catch(() => null);
    }

    async seek(ms) {
        const player = this.queue.getPlayer();
        if (!player || typeof player.seekTo !== 'function') return;
        await player.seekTo(Math.max(0, Number(ms) || 0)).catch(() => null);
    }

    createProgressBar({ length = 20 } = {}) {
        const player = this.queue.getPlayer();
        const total = this.queue.currentTrack?.durationMS || 0;
        const pos = Number(player?.position) || 0;
        if (!total) return '';
        const filled = Math.min(length, Math.round((pos / total) * length));
        return `${'▬'.repeat(filled)}🔘${'▬'.repeat(Math.max(0, length - filled))}`;
    }

    getTimestamp() {
        const player = this.queue.getPlayer();
        const total = this.queue.currentTrack?.durationMS || 0;
        const pos = Number(player?.position) || 0;
        return {
            current: { label: formatMs(pos), value: pos },
            total: { label: formatMs(total), value: total }
        };
    }

    get streamTime() {
        return Number(this.queue.getPlayer()?.position) || 0;
    }
}

class GuildMusicQueue {
    /**
     * @param {import('discord.js').Guild} guild
     * @param {import('discord.js').VoiceBasedChannel} voiceChannel
     * @param {import('discord.js').TextBasedChannel} textChannel
     * @param {object} nodeOptions
     */
    constructor(guild, voiceChannel, textChannel, nodeOptions = {}) {
        this.guild = guild;
        this.guildId = guild.id;
        this.channel = voiceChannel;
        this.voiceChannelId = voiceChannel.id;
        this.metadata = {
            channel: textChannel,
            client: discordClient,
            ...nodeOptions.metadata
        };
        this.tracks = new TrackCollection();
        this.currentTrack = null;
        this.repeatMode = QueueRepeatMode.OFF;
        this._volumePercent = Math.max(0, Math.min(config.musicMaxVolume || 80, config.musicDefaultVolume || 55));
        this._paused = false;
        this._playing = false;
        this._destroyed = false;
        this._history = [];
        this.node = new QueueNodeController(this);
        this.filters = { ffmpeg: new LavalinkFilterAdapter(this) };
        this.leaveOnEmpty = nodeOptions.leaveOnEmpty ?? config.musicLeaveOnEmpty;
        this.leaveOnEmptyCooldown = nodeOptions.leaveOnEmptyCooldown ?? config.musicLeaveOnEmptyCooldownMs;
        this.leaveOnEnd = nodeOptions.leaveOnEnd ?? config.musicLeaveOnEnd;
        this.leaveOnEndCooldown = nodeOptions.leaveOnEndCooldown ?? config.musicLeaveOnEndCooldownMs;
        this._emptyTimer = null;
        this._endTimer = null;
    }

    get id() {
        return this.guildId;
    }

    isPlaying() {
        return this._playing && !!this.currentTrack;
    }

    getPlayer() {
        const s = lavalink.getShoukaku();
        return s?.players?.get(this.guildId) ?? null;
    }

    setRepeatMode(mode) {
        this.repeatMode = mode;
    }

    async ensureConnection() {
        const s = lavalink.getShoukaku();
        if (!s) throw new Error('Lavalink no disponible');

        try {
            const tts = require('./tts-voice-manager');
            if (tts.sessions?.has(this.guildId)) {
                throw new Error('Hay una sesión TTS activa. Usa `/tts desconectar` antes de reproducir música.');
            }
        } catch (e) {
            if (e.message?.includes('TTS')) throw e;
        }

        let player = s.players.get(this.guildId);
        if (player) return player;

        const shardId = this.guild.shard?.id ?? 0;
        player = await s.joinVoiceChannel({
            guildId: this.guildId,
            channelId: this.voiceChannelId,
            shardId,
            deaf: true
        });

        this._bindPlayerEvents(player);
        await player.setGlobalVolume(percentToLavalinkVolume(this._volumePercent)).catch(() => null);
        return player;
    }

    _bindPlayerEvents(player) {
        if (player.__eyedMusicBound) return;
        player.__eyedMusicBound = true;

        player.on('end', (data) => {
            if (this._destroyed) return;
            if (data?.reason === 'replaced') return;
            void this._onTrackEnd();
        });

        player.on('exception', (data) => {
            if (this._destroyed) return;
            const err = new Error(data?.exception?.message || data?.message || 'Error de reproducción');
            playerEvents?.emit(GuildQueueEvent.PlayerError, this, err, this.currentTrack);
            void this.skipCurrent();
        });

        player.on('stuck', () => {
            if (this._destroyed) return;
            void this.skipCurrent();
        });

        player.on('closed', () => {
            if (this._destroyed) return;
            this._cleanupLocal();
            playerEvents?.emit(GuildQueueEvent.Disconnect, this);
        });
    }

    async addTracks(tracks) {
        const list = Array.isArray(tracks) ? tracks : [tracks];
        this.tracks.push(...list.filter(Boolean));
        this._clearLeaveTimers();
    }

    async playTrack(track) {
        if (!track?.encoded) throw new Error('Pista sin datos de Lavalink');
        const player = await this.ensureConnection();
        this.currentTrack = track;
        this._playing = true;
        this._paused = false;
        await player.playTrack({ track: { encoded: track.encoded } });
        await player.setGlobalVolume(percentToLavalinkVolume(this._volumePercent)).catch(() => null);

        if (config.musicCleanProfileEnabled) {
            await this.filters.ffmpeg.setFilters(config.musicCleanFilters).catch(() => null);
        }

        playerEvents?.emit(GuildQueueEvent.PlayerStart, this, track);
    }

    async startPlayback() {
        if (this.currentTrack && this._playing) return;
        let next = this.tracks.shift();
        if (!next && this.repeatMode === QueueRepeatMode.TRACK && this._history.length) {
            next = this._history[this._history.length - 1];
        }
        if (!next) {
            await this._handleEmpty();
            return;
        }
        if (this.currentTrack) this._history.push(this.currentTrack);
        await this.playTrack(next);
    }

    async skipCurrent() {
        const player = this.getPlayer();
        if (!player) {
            await this.startPlayback();
            return;
        }
        try {
            await player.stopTrack();
        } catch {
            await this._onTrackEnd();
        }
    }

    async _onTrackEnd() {
        if (this._destroyed) return;

        if (this.repeatMode === QueueRepeatMode.TRACK && this.currentTrack) {
            await this.playTrack(this.currentTrack);
            return;
        }

        const finished = this.currentTrack;
        if (finished) this._history.push(finished);

        let next = this.tracks.shift();

        if (!next && this.repeatMode === QueueRepeatMode.QUEUE && finished) {
            this.tracks.push(finished);
            next = this.tracks.shift();
        }

        if (!next && this.repeatMode === QueueRepeatMode.AUTOPLAY && finished) {
            next = await this._resolveAutoplay(finished);
        }

        this.currentTrack = null;

        if (!next) {
            this._playing = false;
            await this._handleEmpty();
            return;
        }

        await this.playTrack(next);
    }

    async _resolveAutoplay(track) {
        const q = `ytsearch:${track.author || ''} ${track.title || ''}`.trim();
        try {
            const result = await lavalink.resolve(q);
            const tracks = result?.tracks || [];
            const pick = tracks.map((t) => trackFromLavalink(t, track.requestedBy))
                .find((t) => t.encoded !== track.encoded);
            return pick || null;
        } catch {
            return null;
        }
    }

    async _handleEmpty() {
        this._playing = false;
        playerEvents?.emit(GuildQueueEvent.EmptyQueue, this);

        if (this.leaveOnEnd) {
            this._endTimer = setTimeout(() => {
                if (!this.tracks.size && !this.currentTrack) void this.delete();
            }, Math.max(5000, this.leaveOnEndCooldown || 180000));
            this._endTimer.unref?.();
        }
    }

    _clearLeaveTimers() {
        if (this._emptyTimer) clearTimeout(this._emptyTimer);
        if (this._endTimer) clearTimeout(this._endTimer);
        this._emptyTimer = null;
        this._endTimer = null;
    }

    async play(track, options = {}) {
        if (options?.nodeOptions?.metadata?.channel) {
            this.metadata.channel = options.nodeOptions.metadata.channel;
        }
        if (!track) return;
        if (this.isPlaying()) {
            this.tracks.unshift(track);
            await this.skipCurrent();
            return;
        }
        await this.addTracks(track);
        await this.startPlayback();
    }

    delete() {
        this._destroyed = true;
        this._clearLeaveTimers();
        const s = lavalink.getShoukaku();
        if (s) {
            void s.leaveVoiceChannel(this.guildId).catch(() => null);
        }
        this._cleanupLocal();
        playerEvents?.emit(GuildQueueEvent.Disconnect, this);
    }

    _cleanupLocal() {
        queues.delete(this.guildId);
        this.tracks.clear();
        this.currentTrack = null;
        this._playing = false;
    }

    scheduleEmptyChannelCheck() {
        if (!this.leaveOnEmpty) return;
        if (this._emptyTimer) clearTimeout(this._emptyTimer);
        this._emptyTimer = setTimeout(() => {
            const guild = discordClient?.guilds?.cache?.get(this.guildId);
            const ch = guild?.channels?.cache?.get(this.voiceChannelId);
            if (!ch || typeof ch.isVoiceBased !== 'function' || !ch.isVoiceBased()) return;
            const humans = [...ch.members.values()].filter((m) => m.user && !m.user.bot).length;
            if (humans === 0) this.delete();
        }, Math.max(5000, this.leaveOnEmptyCooldown || 90000));
        this._emptyTimer.unref?.();
    }
}

function useQueue(guildId) {
    return queues.get(String(guildId || '')) || null;
}

function getOrCreateQueue(guild, voiceChannel, textChannel, nodeOptions) {
    const id = guild.id;
    let q = queues.get(id);
    if (q && q.voiceChannelId !== voiceChannel.id) {
        q.delete();
        q = null;
    }
    if (!q) {
        q = new GuildMusicQueue(guild, voiceChannel, textChannel, nodeOptions);
        queues.set(id, q);
    } else if (textChannel) {
        q.metadata.channel = textChannel;
    }
    return q;
}

/**
 * @param {import('discord.js').Client} client
 */
function initQueueManager(client) {
    discordClient = client;
    if (!playerEvents) playerEvents = new EventEmitter();
    playerEvents.setMaxListeners(30);

    if (client.__musicVoiceWatcher) return;
    client.__musicVoiceWatcher = true;

    client.on('voiceStateUpdate', (oldState, newState) => {
        const guildId = newState.guild?.id || oldState.guild?.id;
        if (!guildId) return;
        const q = queues.get(guildId);
        if (!q) return;
        q.scheduleEmptyChannelCheck();
    });
}

function getPlayerEvents() {
    if (!playerEvents) playerEvents = new EventEmitter();
    return playerEvents;
}

function destroyAllQueues() {
    for (const id of [...queues.keys()]) {
        queues.get(id)?.delete();
    }
    queues.clear();
}

/**
 * @param {string} identifier
 * @param {import('discord.js').User} [requestedBy]
 */
async function resolveToTracks(identifier, requestedBy) {
    const result = await lavalink.resolve(identifier);
    if (!result) return { tracks: [], playlist: null, loadType: 'empty' };

    const loadType = result.loadType || 'empty';
    if (loadType === 'error') {
        throw new Error(result.data?.message || 'Error al resolver la pista');
    }
    if (loadType === 'empty' || loadType === 'empty_search') {
        return { tracks: [], playlist: null, loadType };
    }

    if (loadType === 'track') {
        const t = trackFromLavalink(result.data, requestedBy);
        return { tracks: [t], playlist: null, loadType };
    }

    if (loadType === 'search') {
        const tracks = (result.data || []).map((tr) => trackFromLavalink(tr, requestedBy));
        return { tracks, playlist: null, loadType };
    }

    if (loadType === 'playlist' || loadType === 'album') {
        const info = result.data?.info || {};
        const tracks = (result.data?.tracks || []).map((tr) => trackFromLavalink(tr, requestedBy));
        return {
            tracks,
            playlist: {
                title: info.name || 'Playlist',
                url: info.uri || identifier,
                trackCount: tracks.length
            },
            loadType
        };
    }

    return { tracks: [], playlist: null, loadType };
}

module.exports = {
    GuildMusicQueue,
    useQueue,
    getOrCreateQueue,
    initQueueManager,
    getPlayerEvents,
    destroyAllQueues,
    resolveToTracks,
    buildResolveIdentifier,
    trackFromLavalink,
    QueueRepeatMode,
    GuildQueueEvent
};
