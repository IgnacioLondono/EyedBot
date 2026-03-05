const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getQueueOrReply, userInSameVoice } = require('./_common');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription('Salta a un segundo exacto de la canción actual')
        .addIntegerOption((option) =>
            option.setName('segundos').setDescription('Segundo al que quieres ir').setRequired(true).setMinValue(0)
        ),
    cooldown: 2,
    async execute(interaction) {
        const { queue, error } = getQueueOrReply(interaction);
        if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(error)], flags: 64 });
        const voiceCheck = userInSameVoice(interaction, queue);
        if (!voiceCheck.ok) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(voiceCheck.error)], flags: 64 });

        const sec = interaction.options.getInteger('segundos');
        if (typeof queue.node.seek !== 'function') {
            return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ No soportado').setDescription('Seek no está soportado por el extractor actual.')], flags: 64 });
        }

        await queue.node.seek(sec * 1000).catch(() => null);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor('#0099FF').setTitle('⏩ Seek').setDescription(`Movido a **${sec}s**`)] });
    }
};
