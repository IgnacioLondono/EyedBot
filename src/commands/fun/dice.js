const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { setInteractionFooter } = require('../../utils/fun-return');
const { awardMinigameCoins } = require('../../utils/economy-rewards');

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

        const reward = await awardMinigameCoins(interaction.guildId, interaction.user.id, 'dice');
        const rewardLine = reward?.ok
            ? `\n\n💰 Ganaste **${Number(reward.reward || 0).toLocaleString('es-ES')}** monedas.`
            : reward?.reason === 'cooldown'
                ? `\n\n⏳ Recompensa en cooldown.`
                : '';

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('🎲 Lanzamiento de Dado')
            .setDescription(`Resultado: **${result}** de ${sides}${rewardLine}`);

        setInteractionFooter(embed, interaction.user.tag);

        return interaction.reply({ embeds: [embed] });
    }
};













