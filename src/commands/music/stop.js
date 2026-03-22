const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getQueueOrReply, userCanControlMusic } = require('./_common');

module.exports = {
    data: new SlashCommandBuilder().setName('stop').setDescription('Detiene la reproducción y limpia la cola'),
    cooldown: 2,
    async execute(interaction) {
        const { queue, error } = getQueueOrReply(interaction);
        if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(error)], flags: 64 });
        const voiceCheck = await userCanControlMusic(interaction, queue);
        if (!voiceCheck.ok) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(voiceCheck.error)], flags: 64 });

        queue.delete();
        return interaction.reply({ embeds: [new EmbedBuilder().setColor('#0099FF').setTitle('⏹️ Reproducción detenida')] });
    }
};





