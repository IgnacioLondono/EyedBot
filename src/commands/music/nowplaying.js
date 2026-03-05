const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getQueueOrReply } = require('./_common');
const config = require('../../config');
const { QueueRepeatMode } = require('discord-player');

module.exports = {
    data: new SlashCommandBuilder().setName('nowplaying').setDescription('Muestra la canción actual'),
    cooldown: 2,
    async execute(interaction) {
        const { queue, error } = getQueueOrReply(interaction);
        if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(error)], flags: 64 });

        const track = queue.currentTrack;
        const repeatMode = queue.repeatMode ?? QueueRepeatMode.OFF;
        const loopLabel = repeatMode === QueueRepeatMode.TRACK ? 'Canción' : repeatMode === QueueRepeatMode.QUEUE ? 'Cola' : 'Desactivado';
        const status = queue.node.isPaused() ? 'Pausado' : 'Reproduciendo';

        let progress = '';
        let timestamp = track.duration || 'Desconocida';
        try {
            progress = queue.node.createProgressBar({ length: 20, queue: false });
            const ts = queue.node.getTimestamp();
            if (ts) timestamp = `${ts.current.label} / ${ts.total.label}`;
        } catch {}

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('🎵 Ahora sonando')
            .setDescription(`**[${track.title}](${track.url || 'https://youtube.com'})**`)
            .addFields(
                { name: '👤 Artista', value: track.author || 'Desconocido', inline: true },
                { name: '⏱️ Duración', value: track.duration || 'Desconocida', inline: true },
                { name: '📊 Estado', value: `${status} • 🔊 ${queue.node.volume ?? config.musicDefaultVolume}% • 🔁 ${loopLabel}`, inline: false },
                { name: '⏩ Progreso', value: `${timestamp}${progress ? `\n${progress}` : ''}`, inline: false }
            );

        if (track.thumbnail) embed.setThumbnail(track.thumbnail);
        return interaction.reply({ embeds: [embed] });
    }
};
