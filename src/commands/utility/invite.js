const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Genera un enlace de invitación del bot'),
    cooldown: 5,
    async execute(interaction) {
        const clientId = process.env.CLIENT_ID || interaction.client.user.id;
        const permissions = '8'; // Administrator (puedes cambiarlo)
        const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`;

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('🔗 Invitar Bot')
            .setDescription(`[Haz clic aquí para invitar el bot](${inviteUrl})`)
            .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

        return interaction.reply({ embeds: [embed] });
    }
};













