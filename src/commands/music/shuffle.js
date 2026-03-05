const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getQueueOrReply, userInSameVoice } = require('./_common');

module.exports = {
    data: new SlashCommandBuilder().setName('shuffle').setDescription('Mezcla la cola de reproducción'),
    cooldown: 2,
    async execute(interaction) {
        const { queue, error } = getQueueOrReply(interaction);
        if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(error)], flags: 64 });
        const voiceCheck = userInSameVoice(interaction, queue);
        if (!voiceCheck.ok) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(voiceCheck.error)], flags: 64 });

        queue.tracks.shuffle();
        return interaction.reply({ embeds: [new EmbedBuilder().setColor('#0099FF').setTitle('🔀 Cola mezclada')] });
    }
};



