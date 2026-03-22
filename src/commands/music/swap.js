const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { getQueueOrReply, userCanControlMusic } = require('./_common');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('swap')
        .setDescription('Intercambia dos canciones dentro de la cola')
        .addIntegerOption((opt) =>
            opt.setName('a').setDescription('Primera posición (1..n)').setRequired(true).setMinValue(1)
        )
        .addIntegerOption((opt) =>
            opt.setName('b').setDescription('Segunda posición (1..n)').setRequired(true).setMinValue(1)
        ),
    cooldown: 2,
    async execute(interaction) {
        const { queue, error } = getQueueOrReply(interaction);
        if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(error)], flags: 64 });

        const voiceCheck = await userCanControlMusic(interaction, queue);
        if (!voiceCheck.ok) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(voiceCheck.error)], flags: 64 });

        const a = interaction.options.getInteger('a', true) - 1;
        const b = interaction.options.getInteger('b', true) - 1;
        const tracks = queue.tracks.toArray();

        if (tracks.length < 2) {
            return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription('No hay suficientes canciones en cola.')], flags: 64 });
        }

        if (a < 0 || a >= tracks.length || b < 0 || b >= tracks.length || a === b) {
            return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription('Posiciones inválidas.')], flags: 64 });
        }

        const trackA = tracks[a];
        const trackB = tracks[b];

        if (typeof queue.tracks.swapTracks === 'function') {
            queue.tracks.swapTracks(a, b);
        } else {
            // fallback: move twice
            if (typeof queue.tracks.moveTrack === 'function') {
                queue.tracks.moveTrack(a, b);
                queue.tracks.moveTrack(b > a ? b - 1 : b + 1, a);
            }
        }

        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('🔁 Intercambio en cola')
                .setDescription(`**${trackA?.title || 'A'}** ↔️ **${trackB?.title || 'B'}**`)],
            flags: 64
        });
    }
};

