const MusicSystem = require('../../cogs/music');
const { useQueue, QueueRepeatMode } = require('discord-player');

function getMusicSystem(interaction) {
    const musicSystem = interaction.client.musicSystem || new MusicSystem(interaction.client);
    if (!interaction.client.musicSystem) interaction.client.musicSystem = musicSystem;
    return musicSystem;
}

function getQueueOrReply(interaction) {
    const queue = useQueue(interaction.guild.id);
    if (!queue || !queue.currentTrack) {
        return { queue: null, error: 'No hay música reproduciéndose.' };
    }
    return { queue, error: null };
}

function userInSameVoice(interaction, queue) {
    const memberVoice = interaction.member?.voice?.channel;
    if (!memberVoice) return { ok: false, error: 'Debes estar en un canal de voz.' };
    if (queue?.channel && queue.channel.id !== memberVoice.id) {
        return { ok: false, error: 'Debes estar en el mismo canal de voz que el bot.' };
    }
    return { ok: true, error: null };
}

function supportsAutoplayMode() {
    return Number.isInteger(QueueRepeatMode?.AUTOPLAY);
}

function repeatModeLabel(mode) {
    if (mode === QueueRepeatMode.TRACK) return 'Cancion';
    if (mode === QueueRepeatMode.QUEUE) return 'Cola';
    if (supportsAutoplayMode() && mode === QueueRepeatMode.AUTOPLAY) return 'Autoplay';
    return 'Desactivado';
}

function repeatModeChoices() {
    const choices = [
        { name: 'off', value: 'off' },
        { name: 'track', value: 'track' },
        { name: 'queue', value: 'queue' }
    ];

    if (supportsAutoplayMode()) {
        choices.push({ name: 'autoplay', value: 'autoplay' });
    }

    return choices;
}

function repeatModeFromString(mode) {
    if (mode === 'track') return QueueRepeatMode.TRACK;
    if (mode === 'queue') return QueueRepeatMode.QUEUE;
    if (mode === 'autoplay') return supportsAutoplayMode() ? QueueRepeatMode.AUTOPLAY : null;
    return QueueRepeatMode.OFF;
}

function parseDurationToSeconds(value) {
    const input = (value || '').toString().trim();
    if (!input || input.toLowerCase() === 'live' || input.includes('stream')) return 0;

    const parts = input.split(':').map((p) => Number.parseInt(p, 10));
    if (!parts.length || parts.some((p) => !Number.isFinite(p))) return 0;

    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    if (parts.length === 2) return (parts[0] * 60) + parts[1];
    if (parts.length === 1) return parts[0];
    return 0;
}

function formatSeconds(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function requesterLabel(track) {
    const requester = track?.requestedBy;
    if (!requester) return 'Desconocido';
    if (requester?.id) return `<@${requester.id}>`;
    return requester?.username || requester?.tag || 'Desconocido';
}

module.exports = {
    getMusicSystem,
    getQueueOrReply,
    userInSameVoice,
    supportsAutoplayMode,
    repeatModeLabel,
    repeatModeChoices,
    repeatModeFromString,
    parseDurationToSeconds,
    formatSeconds,
    requesterLabel
};
