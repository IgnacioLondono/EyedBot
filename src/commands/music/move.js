const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { getQueueOrReply, userCanControlMusic } = require('./_common');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('move')
        .setDescription('Mueve una canción dentro de la cola')
        .addIntegerOption((opt) =>
            opt.setName('from').setDescription('Posición actual (1..n)').setRequired(true).setMinValue(1)
        )
        .addIntegerOption((opt) =>
            opt.setName('to').setDescription('Nueva posición (1..n)').setRequired(true).setMinValue(1)
        ),
    cooldown: 2,
    async execute(interaction) {
        const { queue, error } = getQueueOrReply(interaction);
        if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(error)], flags: 64 });

        const voiceCheck = await userCanControlMusic(interaction, queue);
        if (!voiceCheck.ok) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(voiceCheck.error)], flags: 64 });

        const from = interaction.options.getInteger('from', true) - 1;
        const to = interaction.options.getInteger('to', true) - 1;
        const tracks = queue.tracks.toArray();

        if (tracks.length === 0) {
            return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription('No hay canciones en cola.')], flags: 64 });
        }

        if (from < 0 || from >= tracks.length || to < 0 || to >= tracks.length) {
            return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription('Posiciones inválidas.')], flags: 64 });
        }

        const moved = tracks[from];
        if (typeof queue.tracks.moveTrack === 'function') {
            queue.tracks.moveTrack(from, to);
        } else if (typeof queue.tracks.swapTracks === 'function') {
            // fallback: do a naive swap if move isn't available
            queue.tracks.swapTracks(from, to);
        }

        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('📌 Movida en la cola')
                .setDescription(`**${moved?.title || 'Canción'}**\nDe **${from + 1}** → **${to + 1}**`)],
            flags: 64
        });
    }
};

