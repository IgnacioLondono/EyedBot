const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { setInteractionFooter } = require('../../utils/fun-return');
const { awardMinigameCoins } = require('../../utils/economy-rewards');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Lanza una moneda'),
    cooldown: 3,
    async execute(interaction) {
        const result = Math.random() < 0.5 ? 'Cara' : 'Cruz';
        const emoji = result === 'Cara' ? '🟡' : '⚫';

        const reward = await awardMinigameCoins(interaction.guildId, interaction.user.id, 'coinflip');
        const rewardLine = reward?.ok
            ? `\n\n💰 Ganaste **${Number(reward.reward || 0).toLocaleString('es-ES')}** monedas.`
            : reward?.reason === 'cooldown'
                ? `\n\n⏳ Recompensa en cooldown.`
                : '';

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('🪙 Lanzamiento de Moneda')
            .setDescription(`Resultado: **${result}** ${emoji}${rewardLine}`);

        setInteractionFooter(embed, interaction.user.tag);

        return interaction.reply({ embeds: [embed] });
    }
};













