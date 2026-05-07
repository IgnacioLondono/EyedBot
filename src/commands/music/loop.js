const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getQueueOrReply, userCanControlMusic, repeatModeChoices, repeatModeFromString } = require('./_common');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Cambia el modo de loop')
        .addStringOption((option) =>
            option
                .setName('modo')
                .setDescription('Modo de loop')
                .setRequired(true)
                .addChoices(...repeatModeChoices())
        ),
    cooldown: 2,
    async execute(interaction) {
        const { queue, error } = getQueueOrReply(interaction);
        if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(error)], flags: 64 });
        const voiceCheck = await userCanControlMusic(interaction, queue);
        if (!voiceCheck.ok) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(voiceCheck.error)], flags: 64 });

        const mode = interaction.options.getString('modo');
        const value = repeatModeFromString(mode);
        if (value === null) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ No soportado').setDescription('Autoplay no está disponible con esta versión de discord-player.')],
                flags: 64
            });
        }

        queue.setRepeatMode(value);

        return interaction.reply({ embeds: [new EmbedBuilder().setColor('#0099FF').setTitle('🔁 Loop').setDescription(`Modo: **${mode}**`)] });
    }
};
