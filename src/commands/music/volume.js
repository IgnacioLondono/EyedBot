const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { getQueueOrReply, userInSameVoice } = require('./_common');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription(`Ajusta el volumen (0-${config.musicMaxVolume})`)
        .addIntegerOption((option) =>
            option
                .setName('valor')
                .setDescription(`Volumen entre 0 y ${config.musicMaxVolume}`)
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(config.musicMaxVolume)
        ),
    cooldown: 2,
    async execute(interaction) {
        const { queue, error } = getQueueOrReply(interaction);
        if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(error)], flags: 64 });
        const voiceCheck = userInSameVoice(interaction, queue);
        if (!voiceCheck.ok) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(voiceCheck.error)], flags: 64 });

        const value = interaction.options.getInteger('valor');
        queue.node.setVolume(value);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor).setTitle('🔊 Volumen').setDescription(`Volumen establecido en **${value}%** (rango limpio recomendado: 45-70%)`)] });
    }
};






