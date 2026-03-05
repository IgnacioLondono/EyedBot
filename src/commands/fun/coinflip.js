const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Lanza una moneda'),
    cooldown: 3,
    async execute(interaction) {
        const result = Math.random() < 0.5 ? 'Cara' : 'Cruz';
        const emoji = result === 'Cara' ? '🟡' : '⚫';

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('🪙 Lanzamiento de Moneda')
            .setDescription(`Resultado: **${result}** ${emoji}`)
            .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

        return interaction.reply({ embeds: [embed] });
    }
};













