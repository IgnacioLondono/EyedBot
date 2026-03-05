const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const conversationManager = require('../../utils/ai-conversation');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ai-clear')
        .setDescription('Limpia el historial de conversación con la IA'),
    cooldown: 3,
    async execute(interaction) {
        const userId = interaction.user.id;
        const channelId = interaction.channel.id;

        // Limpiar historial
        conversationManager.clearHistory(userId, channelId);

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('✅ Historial Limpiado')
            .setDescription('El historial de conversación con la IA ha sido eliminado.')
            .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

        return interaction.reply({ embeds: [embed], flags: 64 });
    }
};

