const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getQueueOrReply, userCanControlMusic } = require('./_common');

module.exports = {
    data: new SlashCommandBuilder().setName('pause').setDescription('Pausa la reproducción actual'),
    cooldown: 2,
    async execute(interaction) {
        const { queue, error } = getQueueOrReply(interaction);
        if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(error)], flags: 64 });
        const voiceCheck = await userCanControlMusic(interaction, queue);
        if (!voiceCheck.ok) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(voiceCheck.error)], flags: 64 });

        queue.node.pause();
        return interaction.reply({ embeds: [new EmbedBuilder().setColor('#0099FF').setTitle('⏸️ Pausado')] });
    }
};





