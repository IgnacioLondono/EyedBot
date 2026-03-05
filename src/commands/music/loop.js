const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { QueueRepeatMode } = require('discord-player');
const { getQueueOrReply, userInSameVoice } = require('./_common');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Cambia el modo de loop')
        .addStringOption((option) =>
            option
                .setName('modo')
                .setDescription('Modo de loop')
                .setRequired(true)
                .addChoices(
                    { name: 'off', value: 'off' },
                    { name: 'track', value: 'track' },
                    { name: 'queue', value: 'queue' }
                )
        ),
    cooldown: 2,
    async execute(interaction) {
        const { queue, error } = getQueueOrReply(interaction);
        if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(error)], flags: 64 });
        const voiceCheck = userInSameVoice(interaction, queue);
        if (!voiceCheck.ok) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(voiceCheck.error)], flags: 64 });

        const mode = interaction.options.getString('modo');
        const value = mode === 'track' ? QueueRepeatMode.TRACK : mode === 'queue' ? QueueRepeatMode.QUEUE : QueueRepeatMode.OFF;
        queue.setRepeatMode(value);

        return interaction.reply({ embeds: [new EmbedBuilder().setColor('#0099FF').setTitle('🔁 Loop').setDescription(`Modo: **${mode}**`)] });
    }
};
