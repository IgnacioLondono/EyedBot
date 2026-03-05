const MusicSystem = require('../../cogs/music');
const { useQueue } = require('discord-player');

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

module.exports = {
    getMusicSystem,
    getQueueOrReply,
    userInSameVoice
};
