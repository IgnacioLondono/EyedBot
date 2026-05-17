const { EventEmitter } = require('events');
const {
    getOrCreateQueue,
    getPlayerEvents,
    resolveToTracks,
    buildResolveIdentifier
} = require('./music-queue-manager');
const { GuildQueueEvent } = require('./music-repeat-modes');

class SearchResult {
    /**
     * @param {object[]} tracks
     * @param {object | null} [playlist]
     */
    constructor(tracks, playlist = null) {
        this.tracks = tracks;
        this.playlist = playlist;
    }

    hasTracks() {
        return this.tracks.length > 0;
    }
}

class MusicPlayerFacade {
    /**
     * @param {import('discord.js').Client} client
     */
    constructor(client) {
        this.client = client;
        this.events = getPlayerEvents();
    }

    /**
     * @param {string} query
     * @param {{ requestedBy?: import('discord.js').User, searchEngine?: string }} [options]
     */
    async search(query, options = {}) {
        const requestedBy = options.requestedBy || null;
        const identifier = buildResolveIdentifier(query, options.searchEngine || 'youtube');
        const { tracks, playlist } = await resolveToTracks(identifier, requestedBy);
        return new SearchResult(tracks, playlist);
    }

    /**
     * @param {import('discord.js').VoiceBasedChannel} voiceChannel
     * @param {string} query
     * @param {{ requestedBy?: import('discord.js').User, nodeOptions?: object, searchEngine?: string }} [options]
     */
    async play(voiceChannel, query, options = {}) {
        const guild = voiceChannel.guild;
        const textChannel = options?.nodeOptions?.metadata?.channel || null;
        if (!textChannel) {
            throw new Error('Falta canal de texto en nodeOptions.metadata.channel');
        }

        const nodeOptions = { ...options.nodeOptions, metadata: { ...options.nodeOptions?.metadata, channel: textChannel } };
        const queue = getOrCreateQueue(guild, voiceChannel, textChannel, nodeOptions);
        const requestedBy = options.requestedBy || null;

        const identifier = buildResolveIdentifier(query, options.searchEngine || 'youtube');
        const { tracks, playlist } = await resolveToTracks(identifier, requestedBy);

        if (!tracks.length) {
            return null;
        }

        const wasPlaying = queue.isPlaying();

        if (playlist && tracks.length > 1) {
            await queue.addTracks(tracks);
            if (!wasPlaying) await queue.startPlayback();
            return { track: tracks[0], playlist, queue };
        }

        const track = tracks[0];
        await queue.addTracks(track);
        if (!wasPlaying) await queue.startPlayback();

        return { track, queue };
    }
}

/**
 * @param {import('discord.js').Client} client
 */
function createMusicPlayerFacade(client) {
    return new MusicPlayerFacade(client);
}

module.exports = {
    MusicPlayerFacade,
    createMusicPlayerFacade,
    SearchResult,
    GuildQueueEvent
};
