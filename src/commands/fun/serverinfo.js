const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { setInteractionFooter } = require('../../utils/fun-return');

function formatCreationDate(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'N/A';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

function formatVerificationLevel(level) {
    const labels = ['Ninguna', 'Baja', 'Media', 'Alta', 'Muy alta'];
    const key = Number.parseInt(level, 10);
    return labels[key] || 'N/A';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Muestra información del servidor'),
    cooldown: 3,
    async execute(interaction) {
        const guild = interaction.guild;
        const createdDate = formatCreationDate(guild.createdTimestamp);
        const verification = formatVerificationLevel(guild.verificationLevel);
        const description = [
            `🆔 **ID:** ${guild.id}`,
            `👑 **Dueño/a:** <@${guild.ownerId}>`,
            `📅 **Fecha de creación:** \`${createdDate}\``,
            `👥 **Miembros:** ${guild.memberCount}`,
            `💬 **Canales:** ${guild.channels.cache.size}`,
            `⚔️ **Roles:** ${guild.roles.cache.size}`,
            `🌵 **Emojis:** ${guild.emojis.cache.size}`,
            `🚀 **Mejoras:** ${guild.premiumSubscriptionCount || 0}`,
            `🔒 **Verificación:** ${verification}`
        ].join('\n');

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(`[${guild.name}]`)
            .setDescription(description)
            .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
            .setTimestamp();

        setInteractionFooter(embed, interaction.user.tag);

        return interaction.reply({ embeds: [embed] });
    }
};
