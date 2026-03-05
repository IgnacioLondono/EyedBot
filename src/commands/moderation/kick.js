const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');
const db = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Expulsa a un usuario del servidor')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a expulsar')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('razon')
                .setDescription('Razón de la expulsión')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    cooldown: 5,
    async execute(interaction) {
        const user = interaction.options.getUser('usuario');
        const reason = interaction.options.getString('razon') || 'Sin razón especificada';
        const member = interaction.guild.members.cache.get(user.id);

        if (!member) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'Usuario no encontrado.')],
                flags: 64
            });
        }

        if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'No puedes expulsar a este usuario.')],
                flags: 64
            });
        }

        try {
            await member.kick(reason);
            
            const kicks = await db.get(`kicks_${interaction.guild.id}`) || [];
            kicks.push({
                user: user.id,
                moderator: interaction.user.id,
                reason: reason,
                date: new Date().toISOString()
            });
            await db.set(`kicks_${interaction.guild.id}`, kicks);

            return interaction.reply({
                embeds: [Embeds.success('Usuario Expulsado', `${user.tag} ha sido expulsado.\n**Razón:** ${reason}`)]
            });
        } catch (error) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'No se pudo expulsar al usuario.')],
                flags: 64
            });
        }
    }
};






