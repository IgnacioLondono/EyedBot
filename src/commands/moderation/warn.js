const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');
const db = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Advierte a un usuario')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a advertir')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('razon')
                .setDescription('Razón de la advertencia')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    cooldown: 5,
    async execute(interaction) {
        const user = interaction.options.getUser('usuario');
        const reason = interaction.options.getString('razon') || 'Sin razón especificada';

        const warns = await db.get(`warns_${interaction.guild.id}_${user.id}`) || [];
        warns.push({
            moderator: interaction.user.id,
            reason: reason,
            date: new Date().toISOString()
        });
        await db.set(`warns_${interaction.guild.id}_${user.id}`, warns);

        return interaction.reply({
            embeds: [Embeds.success('Advertencia', `${user.tag} ha sido advertido.\n**Razón:** ${reason}\n**Total de advertencias:** ${warns.length}`)]
        });
    }
};













