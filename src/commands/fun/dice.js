const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dice')
        .setDescription('Lanza un dado')
        .addIntegerOption(option =>
            option.setName('caras')
                .setDescription('Número de caras del dado (por defecto 6)')
                .setRequired(false)
                .setMinValue(2)
                .setMaxValue(100)),
    cooldown: 3,
    async execute(interaction) {
        const sides = interaction.options.getInteger('caras') || 6;
        const result = Math.floor(Math.random() * sides) + 1;

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('🎲 Lanzamiento de Dado')
            .setDescription(`Resultado: **${result}** de ${sides}`)
            .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

        return interaction.reply({ embeds: [embed] });
    }
};













