const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../../utils/database');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('Muestra las advertencias de un usuario')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a revisar')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    cooldown: 3,
    async execute(interaction) {
        const user = interaction.options.getUser('usuario');
        const warns = await db.get(`warns_${interaction.guild.id}_${user.id}`) || [];

        if (warns.length === 0) {
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor(config.embedColor)
                    .setTitle('Advertencias')
                    .setDescription(`${user.tag} no tiene advertencias.`)]
            });
        }

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(`Advertencias de ${user.tag}`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .setDescription(`Total: ${warns.length}`);

        warns.slice(0, 10).forEach((warn, index) => {
            const moderator = interaction.guild.members.cache.get(warn.moderator);
            embed.addFields({
                name: `Advertencia #${index + 1}`,
                value: `**Moderador:** ${moderator ? moderator.user.tag : 'Desconocido'}\n**Razón:** ${warn.reason}\n**Fecha:** <t:${Math.floor(new Date(warn.date).getTime() / 1000)}:R>`
            });
        });

        return interaction.reply({ embeds: [embed] });
    }
};













