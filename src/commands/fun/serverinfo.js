const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Muestra información del servidor'),
    cooldown: 3,
    async execute(interaction) {
        const guild = interaction.guild;

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(`Información de ${guild.name}`)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: 'ID', value: guild.id, inline: true },
                { name: 'Dueño', value: `<@${guild.ownerId}>`, inline: true },
                { name: 'Miembros', value: guild.memberCount.toString(), inline: true },
                { name: 'Canales', value: guild.channels.cache.size.toString(), inline: true },
                { name: 'Roles', value: guild.roles.cache.size.toString(), inline: true },
                { name: 'Creado', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
                { name: 'Boost', value: `Nivel ${guild.premiumTier} (${guild.premiumSubscriptionCount} boosts)`, inline: true }
            )
            .setFooter({ text: `Solicitado por ${interaction.user.tag}` })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};













