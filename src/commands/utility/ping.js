const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Muestra la latencia del bot'),
    cooldown: 3,
    async execute(interaction) {
        const sent = await interaction.deferReply({ fetchReply: true });
        const timeDiff = sent.createdTimestamp - interaction.createdTimestamp;

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('🏓 Pong!')
            .addFields(
                { name: 'Latencia del Bot', value: `${timeDiff}ms`, inline: true },
                { name: 'Latencia de la API', value: `${interaction.client.ws.ping}ms`, inline: true }
            )
            .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

        return interaction.editReply({ embeds: [embed] });
    }
};













