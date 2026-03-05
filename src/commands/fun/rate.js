const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rate')
        .setDescription('Califica algo')
        .addStringOption(option =>
            option.setName('cosa')
                .setDescription('Qué calificar')
                .setRequired(true)),
    cooldown: 3,
    async execute(interaction) {
        const thing = interaction.options.getString('cosa');
        const rating = Math.floor(Math.random() * 11); // 0-10

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('⭐ Calificación')
            .setDescription(`Califico **${thing}** con un **${rating}/10**`)
            .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

        return interaction.reply({ embeds: [embed] });
    }
};













