const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { QueueRepeatMode } = require('discord-player');
const { getQueueOrReply, userInSameVoice, supportsAutoplayMode } = require('./_common');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autoplay')
        .setDescription('Activa o desactiva autoplay para seguir con canciones relacionadas')
        .addStringOption((option) =>
            option
                .setName('estado')
                .setDescription('Estado de autoplay')
                .setRequired(true)
                .addChoices(
                    { name: 'on', value: 'on' },
                    { name: 'off', value: 'off' }
                )
        ),
    cooldown: 2,
    async execute(interaction) {
        if (!supportsAutoplayMode()) {
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('❌ No soportado')
                    .setDescription('Autoplay no está disponible con esta versión de discord-player.')],
                flags: 64
            });
        }

        const { queue, error } = getQueueOrReply(interaction);
        if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(error)], flags: 64 });

        const voiceCheck = userInSameVoice(interaction, queue);
        if (!voiceCheck.ok) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(voiceCheck.error)], flags: 64 });

        const state = interaction.options.getString('estado');
        if (state === 'on') {
            queue.setRepeatMode(QueueRepeatMode.AUTOPLAY);
            return interaction.reply({ embeds: [new EmbedBuilder().setColor('#0099FF').setTitle('🤖 Autoplay').setDescription('Autoplay **activado**.')] });
        }

        queue.setRepeatMode(QueueRepeatMode.OFF);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor('#0099FF').setTitle('🤖 Autoplay').setDescription('Autoplay **desactivado**.')] });
    }
};
