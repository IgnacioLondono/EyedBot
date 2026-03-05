const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getQueueOrReply, userInSameVoice } = require('./_common');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Quita una canción de la cola por posición')
        .addIntegerOption((option) =>
            option.setName('posicion').setDescription('Posición en la cola (1..n)').setRequired(true).setMinValue(1)
        ),
    cooldown: 2,
    async execute(interaction) {
        const { queue, error } = getQueueOrReply(interaction);
        if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(error)], flags: 64 });
        const voiceCheck = userInSameVoice(interaction, queue);
        if (!voiceCheck.ok) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(voiceCheck.error)], flags: 64 });

        const index = interaction.options.getInteger('posicion') - 1;
        const tracks = queue.tracks.toArray();
        if (index < 0 || index >= tracks.length) {
            return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription('Posición inválida.')], flags: 64 });
        }

        const removed = tracks[index];
        queue.removeTrack(index);

        return interaction.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setTitle('🗑️ Canción eliminada').setDescription(`**${removed.title}**`)] });
    }
};


